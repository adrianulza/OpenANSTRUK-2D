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
import type { SteelSectionInput } from "./types"
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
  di: SteelSectionInput
  cr: SteelCriteria
  efByCombo: Record<LoadComboId, MemberEndForces>
  raw: MemberZoneDemands
  Pu: number
  isVertical: boolean
}

/**
 * Cb from the member's own moment diagram (AISC F1-1).
 *
 * AISC F1-1 is defined on the UNBRACED SEGMENT, not on the member. When the
 * member IS the segment (Lb >= L) the two coincide and this is exact.
 *
 * When the user enters a shorter Lb we cannot know where the segment sits —
 * OpenAnstruk has no intermediate lateral-brace concept — and the full-member
 * value is NOT a conservative stand-in. For a member whose moment reverses
 * sign, the full-member Cb reaches 2.273 while the true Cb of the critical end
 * segment is 1.25: using the member value would inflate Mn by up to 1.82x in
 * the LTB range. So we fall back to Cb = 1.0, which is what SAP2000 itself does
 * when it cannot resolve the segment (CSI manual §3.5.3, "the program also
 * defaults Cb to 1.0 if the minor unbraced length ... is redefined"). The user
 * can still override Cb explicitly.
 */
function memberCb(ef: MemberEndForces, L: number, Lb: number): number {
  if (Lb < L * 1000 - 1e-9) return 1.0
  const at = (t: number) => Math.abs(memberInternalForces(ef, t * L, L).M)
  const MA = at(0.25)
  const MB = at(0.5)
  const MC = at(0.75)
  const Mmax = Math.max(at(0), MA, MB, MC, at(1))
  return cbFactor(Mmax, MA, MB, MC)
}

export function designMemberSteel(inp: SteelMemberInput): MemberDesignResult {
  const { memberId, section, L, di, cr, efByCombo, Pu } = inp

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
  const K33 = di.K33 ?? 1.0
  const K22 = di.K22 ?? 1.0
  const Lb = di.Lb && di.Lb > 0 ? di.Lb * 1000 : Lmm

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
  // ("Kz … taken equal to KLTB", "Lz … taken equal to L22 by default"). A
  // user-shortened Lb deliberately does NOT shorten Lz: that matches SAP2000's
  // out-of-the-box behaviour, which is what the bridge compares against.
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

  // Weak-axis-only compressive strength, for the H1-2 out-of-plane check.
  const compY = compressionStrength({
    g, Ag, r33: rAx33, r22: rAx22, Fy, E, KL33: K22 * Lmm, KL22: K22 * Lmm, e4,
  })
  const Pcy = cr.phiC * compY.Pn

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
    /** H1.3 / H1-2 capacities at the governing station, for the report deck. */
    Mc33NoLTB: 0, Mc33Cb1: 0,
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
    const Cb = di.Cb !== undefined && di.Cb > 0 ? di.Cb : memberCb(ef, L, Lb)

    // A tee needs BOTH sign branches; every other shape reuses one result for
    // all stations. Computed once per combination either way — the per-station
    // work below is only a lookup.
    const flexPos = flexuralStrength(flexArgs(Cb, 1))
    const flexNeg = signDependent ? flexuralStrength(flexArgs(Cb, -1)) : flexPos

    const capsOf = (flex: FlexureResult) => ({
      Mc33: cr.phiB * flex.Mn,
      Mc33NoLTB: cr.phiB * flex.MnNoLTB,
      // AISC H1-2 wants the Cb = 1.0 strength, capped at φMp (CSI §3.6.1b).
      Mc33Cb1: Math.min(cr.phiB * flex.MnCb1, cr.phiB * flex.Mp),
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
        res = interactionRatio({
          Pr, PcComp, PcTens, Mr33: Mr, Mc33: cap.Mc33,
          Mc33NoLTB: cap.Mc33NoLTB, Mc33Cb1: cap.Mc33Cb1, Pcy, Cb,
          // AISC H1.3 is titled "…ROLLED Compact Members" and our parametric IWF
          // is modelled as built-up everywhere else in this engine. CSI applies
          // the alternative regardless, so it is opt-in rather than assumed.
          allowH13:
            g.kind === "iwf" && flexCls.cls === "compact" && cr.h13ForBuiltUp === true,
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
          Mc33NoLTB: cap.Mc33NoLTB, Mc33Cb1: cap.Mc33Cb1,
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
    pass: best.ratio <= 1 && shearRatio <= 1,
    warnings,
    Fez: comp.Fez,
    bucklingMode: comp.governingMode,
    // Interaction-surface inputs for the report deck. Presentation only — the
    // D/C above is already decided; these let the UI draw the envelope the check
    // was made against and plot the demands on it.
    pmPairs,
    Mc33NoLTB: best.Mc33NoLTB,
    Mc33Cb1: best.Mc33Cb1,
    Pcy,
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

  // Element kind is reported for the canvas/report, but every steel member
  // runs the SAME Chapter H check — unlike RC there is no separate beam and
  // column formulation, only different demands.
  const kind: "beam" | "column" =
    di.elementType === "column" ? "column"
      : di.elementType === "beam" ? "beam"
        : inp.isVertical ? "column" : "beam"

  return {
    memberId, status: "designed", material: "steel", kind, Pu,
    steel,
    worstFlexureDC: Math.max(best.ratio, 0),
    worstShearPass: shearRatio <= 1,
  }
}
