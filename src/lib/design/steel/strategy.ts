/**
 * Steel member design strategy (AISC 360-16 / SNI 1729:2020).
 *
 * Checks every design station of every enabled combination and reports the
 * governing one, mirroring how SAP2000 works (CSI manual §2.2/§2.3) rather
 * than enveloping P and M independently — for an interaction equation the
 * axial and the moment must be the ones acting TOGETHER.
 *
 * Pure domain module: no React imports.
 *
 * KNOWN LIMITATIONS (documented, not silent):
 *  - Cb is computed from the full member's moment diagram ONLY when the member
 *    is its own unbraced segment (Lb >= L). If the user enters a shorter Lb,
 *    Cb reverts to 1.0 — see `memberCb` for why the full-member value is not
 *    merely conservative there.
 *  - K = 1.0 by default (AISC Direct Analysis Method). Sway-frame K via the
 *    alignment chart is not computed.
 *  - No second-order amplification (B1/B2). The solver is first-order, so for
 *    sway-sensitive frames the user must supply amplified demands.
 *  - I-shapes with a noncompact or slender WEB (AISC F4/F5) are rejected
 *    rather than approximated, as are round HSS past D/t = 0.45E/Fy.
 */

import type { MemberId, Section } from "@/lib/model"
import type { LoadComboId } from "@/lib/load-cases"
import type { MemberEndForces } from "@/lib/solver"
import { memberInternalForces } from "@/lib/solver"
import type { MemberDesignResult, SteelDesignResult } from "../core/types"
import type { MemberZoneDemands } from "../core/demands"
import type { SteelCriteria } from "./criteria"
import type { SteelMemberRole } from "./member-role"
import { checkSeismic } from "./seismic"
import { classifyAxial, classifyFlexure, classLabel } from "./rules"
import { compressionStrength, tensionStrength, type E4Input } from "./compression"
import { cbFactor, flexuralStrength, type FlexureInput, type FlexureResult } from "./flexure"
import { isSteelPropsError, resolveSteelSection, steelFlexureInput } from "./section-props"
import { shearStrength } from "./shear"
import { h2Ratio, interactionRatio } from "./interaction"

/** Design stations per member. CSI defaults to at least 3; 11 gives a smooth
 *  envelope without meaningful cost at our model sizes. */
const N_STATIONS = 11

export interface SteelMemberInput {
  memberId: MemberId
  section: Section
  L: number
  cr: SteelCriteria
  efByCombo: Record<LoadComboId, MemberEndForces>
  raw: MemberZoneDemands
  Pu: number
  /**
   * Geometric role, inferred by the caller from the member's end coordinates.
   * Reported only — it selects no branch in this module, because AISC 360 runs
   * the same Chapter H check for every member. See `member-role.ts`.
   */
  role: SteelMemberRole
}

/**
 * Cb from the member's own moment diagram (AISC F1-1).
 *
 * AISC F1-1 is defined on the UNBRACED SEGMENT, not on the member. Because
 * `Lb` is always the full member length (see `designMemberSteel`), the member IS
 * the segment and this is exact — there is no shorter-segment case to guard
 * against, and no user override.
 */
function memberCb(ef: MemberEndForces, L: number): number {
  const at = (t: number) => Math.abs(memberInternalForces(ef, t * L, L).M)
  const MA = at(0.25)
  const MB = at(0.5)
  const MC = at(0.75)
  const Mmax = Math.max(at(0), MA, MB, MC, at(1))
  return cbFactor(Mmax, MA, MB, MC)
}

export function designMemberSteel(inp: SteelMemberInput): MemberDesignResult {
  const { memberId, section, L, cr, efByCombo, Pu, role } = inp

  // Material: the section's own strength wins over the global criteria default,
  // so a model can mix grades. Fall back to the criteria when absent.
  // Fu is not read: tension RUPTURE (D2-2) needs a net section from a
  // connection model, which does not exist here, so only yielding is checked.
  //
  // Resolved through the SAME helper the report decks use, so what the deck
  // draws and what the check ran on cannot drift apart.
  const rs = resolveSteelSection(section, cr.Fy, cr.E)
  if (isSteelPropsError(rs)) {
    // Never refuse silently — run-design.ts surfaces `note` as a run issue, and
    // a member that just vanishes from the results reads as a bug.
    return {
      memberId, status: "not-implemented", material: "steel", Pu, note: rs.error,
    }
  }
  const { g, Fy, E, Ag, r33, r22, principal } = rs

  const flexCls = classifyFlexure(g, Fy, E)
  const Lmm = L * 1000

  /**
   * Effective-length factors are fixed at 1.0 and the unbraced length is always
   * the full member length. Both match SAP2000's own defaults for these members
   * (`K1Major = K1Minor = K2Major = K2Minor = 1`, `XLLTB = 1`), measured via the
   * bridge.
   *
   * `Lb = L` is CONSERVATIVE — a laterally braced beam has more capacity than
   * this reports (measured: +27.3% on a 6 m IWF400x200 braced at third points).
   * Bracing is an out-of-plane restraint and the model is 2D, so it cannot be
   * inferred; **subdividing the member is how bracing is expressed**, since each
   * sub-member then carries its own shorter Lb.
   *
   * `K = 1.0` is NOT conservative for sway frames. It is what the AISC Direct
   * Analysis Method prescribes, but DAM also requires second-order analysis,
   * reduced stiffness and notional loads, none of which this engine has — so the
   * engine is limited to BRACED frames. See docs/DESIGN_STEEL.md §S13.
   */
  const K33 = 1.0
  const K22 = 1.0
  const Lb = Lmm

  /**
   * A single angle's principal axes are rotated from the geometric axis the
   * solver bends about, so ONE geometric moment produces TWO principal
   * components and the member must be checked with AISC H2 rather than H1.
   * Everything that branches on this reads the presence of the principal block,
   * not the shape name, so a future unsymmetric shape inherits the path.
   */
  const isUnsymmetric = g.kind === "angle" && principal !== undefined
  /** A tee's capacity depends on the SIGN of the moment (AISC F9). */
  const signDependent = g.kind === "tee"

  const flexArgs = (Cb: number, momentSign: 1 | -1 = 1): FlexureInput =>
    steelFlexureInput(rs, Lb, Cb, momentSign)

  // Scope gate. flexuralStrength reports `outOfScope` for anything it cannot
  // answer inside its implemented clauses — a noncompact/slender I-web (F4/F5),
  // a round HSS past D/t = 0.45E/Fy, a box web past F7-5's calibrated range, or
  // a section missing the J/rts/ho needed for LTB. Probe once with Cb = 1 (the
  // flag does not depend on Cb) and refuse before doing any further work: a
  // capacity produced by the wrong clause is worse than no capacity.
  //
  // Probed on the NEGATIVE branch too, because a tee's stem-in-compression
  // ladder reads properties the stem-in-tension one does not.
  const probe = flexuralStrength(flexArgs(1))
  const probeNeg = signDependent ? flexuralStrength(flexArgs(1, -1)) : undefined
  const scopeIssue = probe.outOfScope ?? probeNeg?.outOfScope
  if (scopeIssue) {
    return {
      memberId, status: "not-implemented", material: "steel", Pu,
      note: scopeIssue,
    }
  }

  // ── Axial capacities (independent of station) ──
  //
  // AISC E4 data. Evaluated in the GEOMETRIC axes for an I-shape or tee, but in
  // the PRINCIPAL axes for an angle — CSI §3.5.2: "For angle sections, the
  // principal moment of inertia and radii of gyration are used for computing Fe.
  // Also, the maximum value of KL … is used in place of K22L22 or K33L33."
  //
  // Kz = K22 and Lz = the full member length, per CSI §3.5.2's stated defaults
  // ("Kz … taken equal to KLTB", "Lz … taken equal to L22 by default"). With
  // K fixed at 1.0 every effective length here collapses to the member length,
  // which is exactly what SAP2000 uses out of the box — the basis the bridge
  // compares against.
  const KLmax = Math.max(K33 * Lmm, K22 * Lmm)
  const e4: E4Input | undefined =
    rs.J !== undefined && rs.Cw !== undefined
      ? isUnsymmetric
        ? {
            J: rs.J, Cw: rs.Cw, G: rs.G, KLz: K22 * Lmm,
            x0: principal!.w0, y0: principal!.z0,
            I33: principal!.Iw, I22: principal!.Iz,
            r33: principal!.rw, r22: principal!.rz,
            KL33: KLmax, KL22: KLmax,
          }
        : {
            J: rs.J, Cw: rs.Cw, G: rs.G, KLz: K22 * Lmm,
            x0: rs.x0, y0: rs.y0,
            I33: rs.I33, I22: rs.I22,
            r33, r22,
            KL33: K33 * Lmm, KL22: K22 * Lmm,
          }
      : undefined

  // A single angle's flexural buckling is checked on the MINIMUM principal
  // radius of gyration for both axes — CSI §3.5.2: "For Single Angles, the
  // minimum (principal) radius of gyration, rz, is used instead of r22 and r33,
  // conservatively, in computing KL/r." E4 above still uses the true rw/rz pair.
  const rAx33 = isUnsymmetric ? principal!.rz : r33
  const rAx22 = isUnsymmetric ? principal!.rz : r22

  const comp = compressionStrength({
    g, Ag, r33: rAx33, r22: rAx22, Fy, E, KL33: K33 * Lmm, KL22: K22 * Lmm, e4,
  })
  if (comp.tooSlender) {
    return {
      memberId, status: "not-implemented", material: "steel", Pu,
      note: `Round HSS D/t exceeds the AISC E7.2 limit 0.45E/Fy — ` +
        `outside the effective-area formulation and not designed.`,
    }
  }
  const PcComp = cr.phiC * comp.Pn
  const PnTens = tensionStrength(Ag, Fy)
  const PcTens = 0.9 * PnTens // φt = 0.90, yielding on the gross section (D2)

  // ── Shear (independent of station) ──
  const sh = shearStrength(g, Fy, E, Ag)
  const Vc = cr.phiV * sh.Vn

  const axialCls = classifyAxial(g, Fy, E)

  // ── Walk every combo x station; the interaction equation needs P and M
  //    acting together, so nothing may be enveloped independently. ──
  let best = {
    ratio: -1, equation: "none" as string,
    combo: "" as LoadComboId, x: 0, Pr: 0, Mr: 0,
    Mc33: 0, Mn: 0, Mp: 0, Lp: undefined as number | undefined,
    Lr: undefined as number | undefined, Cb: 1, limit: "yielding" as string,
    MnNoLTB: 0,
    /** Angle only: φMn about the two principal axes, kN·m. */
    McW: 0, McZ: 0,
    /** Angle only: the governing station's demand resolved onto those axes. */
    MrW: 0, MrZ: 0,
    /** Tee only: the governing station had the stem in compression. */
    stemInCompression: false,
    /** Section class at the governing station — sign-dependent for a tee. */
    cls: flexCls.cls as string,
  }
  let VrMax = 0
  let PrMax = 0
  let MrMax = 0
  /** Every (P, M) pair checked — the report deck plots these against the
   *  interaction envelope, so they must be the PAIRED values, not envelopes. */
  const pmPairs: { P: number; M: number; combo: LoadComboId }[] = []
  /** A tee's two sign branches, for the report. Same for every station. */
  let McPos: number | undefined
  let McNeg: number | undefined

  // Principal-axis resolution for an unsymmetric section. The solver reports a
  // moment about the GEOMETRIC axis 3; the section resists it about w and z:
  //     Mw = M33·cos α        Mz = −M33·sin α
  // For an equal-leg angle α = 45°, so BOTH components are 0.707·M33 — and
  // since Iz ≈ Iw/4, the minor-principal term usually dominates. That is real
  // behaviour, not a modelling artefact: a single angle bent about a geometric
  // axis is genuinely weak. See DESIGN_STEEL.md §S3.1.
  const cosA = isUnsymmetric ? Math.cos(principal!.alpha) : 1
  const sinA = isUnsymmetric ? Math.sin(principal!.alpha) : 0

  for (const [comboId, ef] of Object.entries(efByCombo)) {
    const Cb = memberCb(ef, L)

    // A tee needs BOTH sign branches; every other shape reuses one result for
    // all stations. Computed once per combination either way — the per-station
    // work below is only a lookup.
    const flexPos = flexuralStrength(flexArgs(Cb, 1))
    const flexNeg = signDependent ? flexuralStrength(flexArgs(Cb, -1)) : flexPos

    const capsOf = (flex: FlexureResult) => ({
      Mc33: cr.phiB * flex.Mn,
    })
    const capPos = capsOf(flexPos)
    const capNeg = capsOf(flexNeg)
    // Cb varies per combination, so keep the LOWEST pair — that is the branch
    // the report should show as the section's available strength.
    McPos = McPos === undefined ? capPos.Mc33 : Math.min(McPos, capPos.Mc33)
    McNeg = McNeg === undefined ? capNeg.Mc33 : Math.min(McNeg, capNeg.Mc33)

    for (let i = 0; i < N_STATIONS; i++) {
      const x = (i / (N_STATIONS - 1)) * L
      const f = memberInternalForces(ef, x, L)
      // Solver N is tension-positive; AISC Pr is compression-positive.
      const Pr = -f.N
      const Mr = Math.abs(f.M)
      const Vr = Math.abs(f.V)
      PrMax = Math.max(PrMax, Pr)
      MrMax = Math.max(MrMax, Mr)
      VrMax = Math.max(VrMax, Vr)
      pmPairs.push({ P: Pr, M: Mr, combo: comboId })

      // Sagging (M ≥ 0) puts the tee's stem in TENSION — see the convention
      // note in sections/shapes/tee.ts.
      const hogging = signDependent && f.M < 0
      const flex = hogging ? flexNeg : flexPos
      const cap = hogging ? capNeg : capPos

      let res
      if (isUnsymmetric) {
        res = h2Ratio({
          Pr, PcComp, PcTens,
          MrW: Mr * cosA, MrZ: Mr * sinA,
          McW: cr.phiB * (flexPos.MnW ?? 0),
          McZ: cr.phiB * (flexPos.MnZ ?? 0),
        })
      } else if (hogging) {
        // CSI §3.6.2: "any T-Shape or Double-Angle shape when subjected to
        // negative major axis moment is checked using the equation given in
        // Section H2". With no minor-axis moment the H2 sum degenerates to
        // Pr/Pc + Mr33/Mc33 — a straight linear interaction, notably harsher
        // than H1-1a's 8/9 factor at high axial load.
        res = h2Ratio({
          Pr, PcComp, PcTens, MrW: Mr, MrZ: 0, McW: cap.Mc33, McZ: 1,
        })
      } else {
        // H1.1 only — the H1.3 alternative is not implemented (interaction.ts).
        res = interactionRatio({
          Pr, PcComp, PcTens, Mr33: Mr, Mc33: cap.Mc33,
        })
      }

      if (res.ratio > best.ratio) {
        best = {
          ratio: res.ratio, equation: res.equation, combo: comboId, x,
          Pr, Mr, Mc33: cap.Mc33, Mn: flex.Mn, Mp: flex.Mp,
          Lp: flex.Lp, Lr: flex.Lr,
          // Report the Cb the clause ACTUALLY used. AISC F10 pins it to 1.0 for
          // a single angle (see flexure.ts::angleShape), so surfacing the
          // member's diagram-derived value here would misreport the basis of
          // the capacity — and did, until the SAP2000 comparison caught it.
          Cb: isUnsymmetric ? 1.0 : Cb,
          limit: flex.governing,
          MnNoLTB: flex.MnNoLTB,
          McW: cr.phiB * (flexPos.MnW ?? 0),
          McZ: cr.phiB * (flexPos.MnZ ?? 0),
          MrW: Mr * cosA, MrZ: Mr * sinA,
          stemInCompression: hogging,
          cls: flex.cls,
        }
      }
    }
  }

  const shearRatio = Vc > 0 ? VrMax / Vc : (VrMax > 0 ? Infinity : 0)
  const warnings: string[] = []
  if (comp.slendernessWarning) {
    warnings.push(`KL/r = ${comp.slenderness.toFixed(0)} > 200 (AISC E2 user note)`)
  }
  if (comp.slender) {
    warnings.push("Slender elements — capacity reduced per AISC E7")
  }

  // ── AISC 341 detailing (undefined for OMF/RMB, so an OMF run is unchanged) ──
  //
  // Uses PrMax — the worst COMPRESSION seen at any station — for Ca, matching
  // D1.1's "required axial strength". Strength is already decided above; these
  // checks neither feed nor alter it.
  const seismic = checkSeismic({
    frameType: cr.frameType,
    g, Fy, E, Ag, Pu: PrMax, phiC: cr.phiC,
    Lb: Lb / 1000,
    ry: rAx22,
    isBeam: role === "beam",
  })
  if (seismic) {
    for (const e of seismic.elements.filter((x) => !x.pass)) {
      warnings.push(
        `${cr.frameType} requires ${seismic.level === "high" ? "highly" : "moderately"} ` +
        `ductile: ${e.name} λ = ${e.lambda.toFixed(1)} > ${e.limit.toFixed(1)} (D1.1)`,
      )
    }
    if (seismic.bracing && !seismic.bracing.pass) {
      warnings.push(
        `D1.2 bracing: Lb = ${seismic.bracing.Lb.toFixed(2)} m > ` +
        `${seismic.bracing.LbMax.toFixed(2)} m — subdivide if really braced`,
      )
    }
  }

  const steel: SteelDesignResult = {
    // Reported at the GOVERNING station. For a tee that matters: the same
    // section is classified on its flange when sagging and on its stem when
    // hogging, so the class genuinely differs between the two.
    sectionClass: classLabel((best.cls || flexCls.cls) as typeof flexCls.cls),
    axialClass: classLabel(axialCls.cls),
    ratio: best.ratio,
    equation: best.equation,
    governing: best.combo
      ? { combo: best.combo, x: best.x, Pr: best.Pr, Mr: best.Mr }
      : undefined,
    PcComp, PcTens, Mc33: best.Mc33, Vc,
    Pn: comp.Pn, Mn: best.Mn, Mp: best.Mp, Vn: sh.Vn,
    // All three in METRES. Chapter F works in mm; the result object is the
    // display boundary and is metric-consistent with kN / kN·m throughout.
    Lp: best.Lp !== undefined ? best.Lp / 1000 : undefined,
    Lr: best.Lr !== undefined ? best.Lr / 1000 : undefined,
    Lb: Lb / 1000,
    Cb: best.Cb,
    flexureLimit: best.limit,
    Fe: comp.Fe, Fcr: comp.Fcr, Ae: comp.Ae,
    slenderness: comp.slenderness, slendernessAxis: comp.governingAxis,
    Vr: VrMax, shearRatio,
    PrMax, MrMax,
    // Overall COMPLIANCE, which is broader than the strength ratio: a section
    // can satisfy Chapter H and still be unable to hinge. Ductility is folded in
    // here but deliberately NOT into `ratio` — D/C is a strength quantity, and
    // inflating it would misreport why the member failed. The canvas flags
    // ductility separately, the way RC flags ⚠Ash.
    pass: best.ratio <= 1 && shearRatio <= 1 && (seismic?.ductilityPass ?? true),
    warnings,
    Fez: comp.Fez,
    bucklingMode: comp.governingMode,
    // Interaction-surface inputs for the report deck. Presentation only — the
    // D/C above is already decided; these let the UI draw the envelope the check
    // was made against and plot the demands on it.
    pmPairs,
    role,
    seismic,
    ...(isUnsymmetric
      ? {
          McW: best.McW, McZ: best.McZ,
          MrW: best.MrW, MrZ: best.MrZ,
          alphaPrincipal: principal!.alpha,
          betaW: principal!.betaW,
        }
      : {}),
    ...(signDependent
      ? { stemInCompression: best.stemInCompression, McPos, McNeg }
      : {}),
  }

  return {
    memberId, status: "designed", material: "steel", kind: role, Pu,
    steel,
    worstFlexureDC: Math.max(best.ratio, 0),
    worstShearPass: shearRatio <= 1,
  }
}
