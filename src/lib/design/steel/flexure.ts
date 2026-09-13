/**
 * AISC 360-16 Chapter F — major-axis flexure.
 *
 *   F2  doubly-symmetric compact I-shapes: yielding + lateral-torsional buckling
 *   F3  I-shapes with noncompact/slender FLANGES: + flange local buckling
 *   F4/F5 I-shapes with noncompact/slender WEBS  (see the note below)
 *   F7  rectangular HSS / box: yielding + FLB + WLB, NO lateral-torsional
 *   F8  round HSS: yielding + local buckling, NO lateral-torsional
 *   F9  tees: yielding + LTB + FLB + WLB — SIGN-DEPENDENT (see below)
 *   F10 single angles: yielding + LTB + leg local buckling, on PRINCIPAL axes
 *
 * MINOR-AXIS FLEXURE (F6) IS DELIBERATELY ABSENT. OpenAnstruk's solver is a 2D
 * frame element with a single bending DOF, so Mu22 is identically zero for
 * every member. Implementing F6 would add a code path that can never be
 * reached.
 *
 * TWO SHAPES BREAK THE "ONE Mn PER SECTION" ASSUMPTION the other four hold to:
 *
 *  - A TEE is singly symmetric, so its capacity depends on the SIGN of the
 *    moment: stem-in-tension and stem-in-compression are different limit-state
 *    ladders with different caps (1.6My vs My). `FlexureInput.momentSign`
 *    selects the branch; `strategy.ts` evaluates both once per combination and
 *    picks per station.
 *
 *  - A SINGLE ANGLE has principal axes that do not coincide with the geometric
 *    axis the solver bends about, so ONE geometric moment produces TWO principal
 *    components and needs two capacities. Those come back as `MnW` / `MnZ` and
 *    feed AISC H2 rather than H1.
 *
 * Units: mm, MPa, N·mm internally; kN·m at the boundary.
 */

import type { PrincipalProperties } from "@/lib/model"
import { classifyFlexure, kc, type SteelGeom } from "./rules"

const NMM_TO_KNM = 1e-6

export interface FlexureInput {
  g: SteelGeom
  Fy: number
  E: number
  /** Elastic section modulus about axis 3 (governing fibre), mm³. */
  S33: number
  /** Plastic section modulus about axis 3, mm³. */
  Z33: number
  /** Weak-axis inertia, mm⁴ (LTB). */
  I22: number
  /** Torsional constant, mm⁴ (LTB). */
  J?: number
  /** Effective radius of gyration for LTB, mm (AISC F2-7). */
  rts?: number
  /** Distance between flange centroids, mm. */
  ho?: number
  /** Weak-axis radius of gyration, mm. */
  r22: number
  /** Laterally unbraced length, mm. */
  Lb: number
  /** LTB modification factor (AISC F1-1). */
  Cb: number

  // ── Tee (F9) ───────────────────────────────────────────────────────────────
  /**
   * Elastic section modulus to the FLANGE side, mm³ (tee only). `S33` above is
   * the stem-side value, which is the smaller of the two and therefore the one
   * that sets My. F9-14/F9-15 need the flange-side modulus S33c instead.
   */
  S33t?: number
  /**
   * Sign of the design moment at the station being checked. `+1` (default) is
   * sagging, which for our flange-on-top tee puts the STEM IN TENSION; `−1`
   * puts the stem in compression. Ignored by every doubly-symmetric shape.
   */
  momentSign?: 1 | -1

  // ── Single angle (F10) ─────────────────────────────────────────────────────
  /** Gross area, mm² — F10-4 needs it directly. */
  A?: number
  /** Principal-axis properties. Required for `angle`; unused otherwise. */
  principal?: PrincipalProperties
}

export interface FlexureResult {
  /** Nominal flexural strength, kN·m. */
  Mn: number
  /** Plastic moment, kN·m. */
  Mp: number
  /** Limiting unbraced lengths, mm (undefined where LTB does not apply). */
  Lp?: number
  Lr?: number
  /** Which limit state governed. */
  governing: "yielding" | "LTB-inelastic" | "LTB-elastic" | "FLB" | "WLB" | "LLB"
  /** Section classification for flexure. */
  cls: string
  /** Mn ignoring LTB — AISC H1.3 in-plane instability needs this. */
  MnNoLTB: number
  /**
   * Set when the section falls outside the implemented clause scope. The value
   * is a human-readable reason; `strategy.ts` turns it into a refusal rather
   * than reporting the (meaningless) Mn computed alongside it. Never returning
   * a number for an out-of-scope section is the whole point — a plausible-
   * looking capacity from the wrong clause is worse than no answer.
   */
  outOfScope?: string
  /**
   * Single angle only: nominal strengths about the MAJOR (w) and MINOR (z)
   * PRINCIPAL axes, kN·m. `Mn` mirrors `MnW` so generic consumers still read
   * something meaningful, but the interaction check must use both — see
   * `interaction.ts::h2Ratio`.
   */
  MnW?: number
  MnZ?: number
}

/**
 * AISC F1-1 — lateral-torsional buckling modification factor.
 *
 *   Cb = 12.5·Mmax / (2.5·Mmax + 3·MA + 4·MB + 3·MC) ≤ 3.0
 *
 * MA / MB / MC are the absolute moments at the quarter, mid and three-quarter
 * points of the UNBRACED SEGMENT. OpenAnstruk has no intermediate lateral
 * brace concept, so these come from the full member — see the limitation note
 * in the steel strategy. Cb = 1.0 (conservative) when the diagram is all zero.
 */
export function cbFactor(Mmax: number, MA: number, MB: number, MC: number): number {
  const denom = 2.5 * Math.abs(Mmax) + 3 * Math.abs(MA) + 4 * Math.abs(MB) + 3 * Math.abs(MC)
  if (!(denom > 0)) return 1.0
  return Math.min(3.0, (12.5 * Math.abs(Mmax)) / denom)
}

/** AISC F2-5: Lp = 1.76·r22·√(E/Fy). */
export function lpLength(r22: number, E: number, Fy: number): number {
  return 1.76 * r22 * Math.sqrt(E / Fy)
}

/**
 * AISC F2-6: the limiting unbraced length for inelastic LTB.
 *
 *   Lr = 1.95·rts·(E/0.7Fy)·√(Jc/(S33·ho)) ·
 *        √(1 + √(1 + 6.76·((0.7Fy/E)·(S33·ho/Jc))²))
 *
 * with c = 1.0 for doubly-symmetric I-shapes (F2-8a).
 */
export function lrLength(
  rts: number, E: number, Fy: number, J: number, S33: number, ho: number,
): number {
  const c = 1.0
  const Jc = J * c
  const term = (S33 * ho) / Jc
  const inner = ((0.7 * Fy) / E) * term
  return (
    1.95 * rts * (E / (0.7 * Fy)) * Math.sqrt(Jc / (S33 * ho)) *
    Math.sqrt(1 + Math.sqrt(1 + 6.76 * inner * inner))
  )
}

/** AISC F2-4: elastic LTB stress. */
export function fcrLTB(
  Cb: number, Lb: number, rts: number, E: number, J: number, S33: number, ho: number,
): number {
  const c = 1.0
  const ratio = Lb / rts
  return (
    ((Cb * Math.PI ** 2 * E) / ratio ** 2) *
    Math.sqrt(1 + 0.078 * ((J * c) / (S33 * ho)) * ratio ** 2)
  )
}

// ── I-shape (F2 / F3) ────────────────────────────────────────────────────────

function iShape(inp: FlexureInput): FlexureResult {
  const { g, Fy, E, S33, Z33, J, rts, ho, r22, Lb, Cb } = inp
  const cf = classifyFlexure(g, Fy, E)
  const Mp = Fy * Z33 // F2-1
  let Mn = Mp
  let governing: FlexureResult["governing"] = "yielding"
  let outOfScope: string | undefined

  // F2 and F3 both require a COMPACT web. A noncompact web is F4 (Mn = Rpc·My,
  // with its own Lp per F4-7) and a slender web is F5 (Rpg reduction) — neither
  // is implemented. Running such a section through F2 returns Mn = Mp, which
  // measured 4.1% UNCONSERVATIVE on a noncompact-web girder, and F4's shorter
  // Lp means the error compounds once LTB engages. Refuse instead.
  const webCls = cf.elements.find((e) => e.name === "web")?.cls
  if (webCls && webCls !== "compact") {
    outOfScope =
      `I-shape with a ${webCls} web needs AISC ${webCls === "noncompact" ? "F4" : "F5"}, ` +
      `which is not implemented — F2/F3 would overstate the capacity.`
  }

  // ── Lateral-torsional buckling (F2.2) ──
  // Lb = 0 means continuously braced, so LTB genuinely does not apply. But
  // MISSING J / rts / ho is not a licence to skip the limit state: doing so
  // measured 17.8x unconservative at Lb = 60 m. Sections saved before those
  // properties existed load without them, so this path is reachable from user
  // data — refuse rather than silently return Mp.
  let Lp: number | undefined
  let Lr: number | undefined
  const haveLtbGeom = J !== undefined && rts !== undefined && ho !== undefined
  if (!haveLtbGeom && Lb > 0) {
    outOfScope ??=
      "Section is missing the torsional properties J / rts / ho needed for " +
      "lateral-torsional buckling. Re-create it in the MATERIAL tool."
  }
  if (haveLtbGeom && Lb > 0) {
    Lp = lpLength(r22, E, Fy)
    Lr = lrLength(rts!, E, Fy, J!, S33, ho!)
    // Evaluated twice: once with the member's Cb (the Chapter F answer) and
    // once with Cb = 1.0 (the basis AISC H1-2 requires). Both are capped at Mp.
    const ltbAt = (cb: number): number | undefined => {
      if (Lb > Lp! && Lb <= Lr!) {
        // F2-2: linear interpolation between Mp and 0.7FySx.
        return Math.min(cb * (Mp - (Mp - 0.7 * Fy * S33) * ((Lb - Lp!) / (Lr! - Lp!))), Mp)
      }
      if (Lb > Lr!) {
        return Math.min(fcrLTB(cb, Lb, rts!, E, J!, S33, ho!) * S33, Mp) // F2-3
      }
      return undefined
    }
    const Mltb = ltbAt(Cb)
    if (Mltb !== undefined && Mltb < Mn) {
      Mn = Mltb
      governing = Lb > Lr ? "LTB-elastic" : "LTB-inelastic"
    }
  }

  // ── Compression flange local buckling (F3.2) ──
  const flange = cf.elements.find((e) => e.name === "flange")
  let MnNoLTB = Mp
  if (flange && flange.cls !== "compact" && flange.lambdaP !== undefined) {
    let Mflb: number
    if (flange.cls === "noncompact") {
      // F3-1: interpolate between Mp and 0.7FySx across the flange λ range.
      Mflb =
        Mp -
        (Mp - 0.7 * Fy * S33) *
          ((flange.lambda - flange.lambdaP) / (flange.lambdaR - flange.lambdaP))
    } else {
      // F3-2: slender flange, elastic plate buckling.
      Mflb = (0.9 * E * kc(g.hw, g.tw) * S33) / flange.lambda ** 2
    }
    MnNoLTB = Math.min(MnNoLTB, Mflb)
    if (Mflb < Mn) {
      Mn = Mflb
      governing = "FLB"
    }
  }

  // NOTE ON F4 / F5 (noncompact and slender WEBS): not implemented — see the
  // `outOfScope` guard at the top of this function, which refuses the section
  // rather than letting F2/F3 answer outside their scope.

  return {
    Mn: Mn * NMM_TO_KNM,
    Mp: Mp * NMM_TO_KNM,
    Lp, Lr,
    governing,
    cls: cf.cls,
    MnNoLTB: MnNoLTB * NMM_TO_KNM,
    outOfScope,
  }
}

// ── Rectangular HSS / box (F7) ───────────────────────────────────────────────

function boxShape(inp: FlexureInput): FlexureResult {
  const { g, Fy, E, S33, Z33 } = inp
  const cf = classifyFlexure(g, Fy, E)
  const Mp = Fy * Z33 // F7-1
  let Mn = Mp
  let governing: FlexureResult["governing"] = "yielding"

  const flange = cf.elements.find((e) => e.name === "flange")
  if (flange && flange.cls !== "compact") {
    let Mflb: number
    if (flange.cls === "noncompact") {
      // F7-2
      Mflb = Math.min(
        Mp,
        Mp - (Mp - Fy * S33) * (3.57 * flange.lambda * Math.sqrt(Fy / E) - 4.0),
      )
    } else {
      // F7-3 with the effective flange width of F7-4.
      const be = Math.min(
        g.b,
        1.92 * g.tf * Math.sqrt(E / Fy) *
          (1 - (0.38 / flange.lambda) * Math.sqrt(E / Fy)),
      )
      // Effective section modulus, conservatively scaled by the lost flange.
      const Seff = S33 * (be / g.b)
      Mflb = Fy * Seff
    }
    if (Mflb < Mn) {
      Mn = Mflb
      governing = "FLB"
    }
  }

  let outOfScope: string | undefined
  const web = cf.elements.find((e) => e.name === "web")
  if (web && web.cls !== "compact") {
    // F7-5 (CSI §3.5.3.4.3 applies it to both noncompact and slender webs).
    // The bracket grows without bound with λ, so past h/t ≈ 324 the raw value
    // goes NEGATIVE. AISC never intends a negative flexural strength; that is
    // the formula running out of calibration, not a real capacity. Refuse the
    // section there rather than emitting a number.
    const Mwlb =
      Mp - (Mp - Fy * S33) * (0.305 * web.lambda * Math.sqrt(Fy / E) - 0.738)
    if (Mwlb <= 0) {
      outOfScope =
        `Box web λ = ${web.lambda.toFixed(0)} is beyond the range where AISC ` +
        `F7-5 yields a positive strength — the section is too slender to design.`
    }
    const Mwlbc = Math.min(Mp, Math.max(0, Mwlb))
    if (Mwlbc < Mn) {
      Mn = Mwlbc
      governing = "WLB"
    }
  }

  // Box sections have no LTB limit state, so MnNoLTB == Mn.
  return {
    Mn: Mn * NMM_TO_KNM, Mp: Mp * NMM_TO_KNM,
    governing, cls: cf.cls, MnNoLTB: Mn * NMM_TO_KNM,
    outOfScope,
  }
}

// ── Round HSS (F8) ───────────────────────────────────────────────────────────

function roundShape(inp: FlexureInput): FlexureResult {
  const { g, Fy, E, S33, Z33 } = inp
  const cf = classifyFlexure(g, Fy, E)
  const Mp = Fy * Z33 // F8-1
  const Dt = (g.D ?? g.h) / g.tf
  let Mn = Mp
  let governing: FlexureResult["governing"] = "yielding"

  // AISC F8 user note / CSI §3.5.3.5: the clause applies only while
  // D/t < 0.45E/Fy. Past that a round HSS "is considered to be too slender and
  // it is not designed" (CSI §3.5.2.2.3.2). F8-3 keeps returning a number well
  // beyond the limit — 40 400 kN·m at 3x the limit in the boundary sweep — so
  // the guard has to be explicit.
  // `>=`, not `>`: F8 is stated as applying for D/t < 0.45E/Fy, so the limit
  // value itself is already outside the clause.
  const outOfScope = Dt >= 0.45 * (E / Fy)
    ? `Round HSS D/t = ${Dt.toFixed(0)} reaches the AISC F8 limit ` +
      `0.45E/Fy = ${(0.45 * (E / Fy)).toFixed(0)} — too slender to design.`
    : undefined

  if (cf.cls === "noncompact") {
    // F8-2
    Mn = ((0.021 * E) / Dt + Fy) * S33
    governing = "FLB"
  } else if (cf.cls === "slender") {
    // F8-3 / F8-4
    Mn = ((0.33 * E) / Dt) * S33
    governing = "FLB"
  }
  Mn = Math.min(Mn, Mp)

  return {
    Mn: Mn * NMM_TO_KNM, Mp: Mp * NMM_TO_KNM,
    governing, cls: cf.cls, MnNoLTB: Mn * NMM_TO_KNM,
    outOfScope,
  }
}

// ── Tee (F9) ─────────────────────────────────────────────────────────────────

/**
 * AISC F9 — tees bent about the major axis.
 *
 * Unlike every other shape in this module, the answer depends on the SIGN of the
 * moment, because a tee is only singly symmetric. With the flange on top (this
 * catalogue's convention, see `sections/shapes/tee.ts`):
 *
 *   momentSign +1  sagging   stem in TENSION      Mp ≤ 1.6My (F9-2), FLB active
 *   momentSign −1  hogging   stem in COMPRESSION  Mp ≤ 1.0My (F9-4), WLB active
 *
 * The two ladders also use opposite signs of `B` in the LTB equation (F9-10 vs
 * F9-12), which is what makes a stem-in-compression tee so much weaker: the
 * bracket `B + √(1+B²)` collapses toward zero instead of growing.
 *
 * F9 carries NO Cb (unlike F2) — AISC F9-10 has no such term.
 */
function teeShape(inp: FlexureInput): FlexureResult {
  const { g, Fy, E, S33, Z33, I22, J, Lb } = inp
  const r22 = inp.r22
  const stemInTension = (inp.momentSign ?? 1) >= 0
  // Classify for THIS sign: only the compression-side element is classified.
  const cf = classifyFlexure(g, Fy, E, stemInTension ? 1 : -1)
  const d = g.h

  // My is FIRST yield, so it uses the smaller modulus — the stem tip for a tee.
  const S33c = inp.S33t ?? S33 // flange-side modulus, for FLB
  const My = Fy * Math.min(S33, S33c)

  // F9-2 (stems in tension) / F9-4 (stems in compression).
  const Mp = stemInTension
    ? Math.min(Fy * Z33, 1.6 * My)
    : Math.min(Fy * Z33, My)

  let outOfScope: string | undefined
  // LTB needs Iy and J. Missing either (a section authored before those
  // properties existed) means the limit state cannot be evaluated at all —
  // refuse rather than silently skip it, exactly as the I-shape path does.
  const haveLtbGeom = J !== undefined && J > 0 && I22 > 0
  if (!haveLtbGeom && Lb > 0) {
    outOfScope =
      "Tee is missing the torsional properties (J, I22) needed for AISC F9 " +
      "lateral-torsional buckling. Re-create the section in the MATERIAL tool."
  }

  let Mn = Mp
  let governing: FlexureResult["governing"] = "yielding"
  let Lp: number | undefined
  let Lr: number | undefined

  if (haveLtbGeom && Lb > 0) {
    const Jv = J as number
    Lp = 1.76 * r22 * Math.sqrt(E / Fy) // F9-8
    // F9-9:  Lr = 1.95·(E/Fy)·[√(Iy·J)/Sx]·√(1 + 2.36·(Fy/E)·(d·Sx/J))
    //
    // NOTE the grouping. CSI's manual (p. 3-58) typesets the first radical as
    // √(Iy·J/S33), which cannot be right: that is √(mm⁴·mm⁴/mm³) = mm^2.5, and
    // Lr must come out a length. AISC 360-16 F9-9 has √(Iy·J) over Sx, giving
    // mm⁴/mm³ = mm. The second radical is dimensionless either way. Unlike F2-6
    // there is NO nested radical here.
    Lr =
      1.95 * (E / Fy) * (Math.sqrt(I22 * Jv) / S33) *
      Math.sqrt(1 + 2.36 * (Fy / E) * ((S33 * d) / Jv)) // F9-9

    // F9-10 / F9-12 — B flips sign with the stem's stress state.
    const B = (stemInTension ? 2.3 : -2.3) * (d / Lb) * Math.sqrt(I22 / Jv)
    // `B + √(1+B²)` catastrophically cancels for B ≪ 0, which is exactly the
    // stem-in-compression branch at short Lb: once B² > 1/ε the square root
    // rounds to |B| and the bracket evaluates to 0 instead of ~1/(2|B|), so the
    // capacity collapses to zero and Mn(Lb) stops being monotonic. Use the
    // algebraically identical conjugate form there — (√(1+B²) − B) has no
    // cancellation when B is negative, and the two agree to machine precision
    // wherever both are well conditioned.
    const root = Math.sqrt(1 + B * B)
    const bracket = B >= 0 ? B + root : 1 / (root - B)
    const Mcr = ((1.95 * E) / Lb) * Math.sqrt(I22 * Jv) * bracket // F9-10

    if (!stemInTension) {
      // F9-13 — no plateau: the elastic buckling moment governs at every Lb,
      // capped at My. As Lb → 0, Mcr → ∞ and this tends to My, so it stays
      // continuous with the yielding branch.
      Mn = Math.min(Mcr, My)
      governing = Mn >= My ? "yielding" : "LTB-elastic"
    } else if (Lb <= Lp) {
      Mn = Mp // F9-1
    } else if (Lb <= Lr) {
      Mn = Math.min(Mp, Mp - (Mp - My) * ((Lb - Lp) / (Lr - Lp))) // F9-6
      governing = "LTB-inelastic"
    } else {
      Mn = Math.min(Mcr, Mp) // F9-7
      governing = "LTB-elastic"
    }
  } else if (!stemInTension) {
    // Continuously braced with the stem in compression: F9-13's cap still binds.
    Mn = Math.min(Mn, My)
  }

  // Local buckling. Only ONE of the two applies, decided by which element is in
  // compression — F9.3 is skipped when the flange is in tension and F9.4 when
  // the stem is (CSI §3.5.3.6.1.3 / §3.5.3.6.1.4).
  let MnLocal = Infinity
  if (stemInTension) {
    const fl = cf.elements.find((e) => e.name === "flange")
    if (fl && fl.cls === "noncompact") {
      // F9-14
      MnLocal = Math.min(
        1.6 * My,
        Mp - (Mp - 0.7 * Fy * S33c) * ((fl.lambda - fl.lambdaP!) / (fl.lambdaR - fl.lambdaP!)),
      )
    } else if (fl && fl.cls === "slender") {
      // F9-15
      MnLocal = ((0.7 * E) / (g.b / (2 * g.tf)) ** 2) * S33c
    }
  } else {
    // F9-16..F9-19 — stem (web) local buckling, on the FULL depth d/tw.
    const dt = d / g.tw
    const sq = Math.sqrt(E / Fy)
    let Fcr: number
    if (dt <= 0.84 * sq) Fcr = Fy // F9-17
    else if (dt <= 1.52 * sq) Fcr = (1.43 - 0.515 * dt * Math.sqrt(Fy / E)) * Fy // F9-18
    else Fcr = (1.52 * E) / dt ** 2 // F9-19
    MnLocal = Fcr * S33
  }
  if (MnLocal < Mn) {
    Mn = MnLocal
    governing = stemInTension ? "FLB" : "WLB"
  }

  // MnNoLTB drops only the LTB limit state (AISC H1.3 in-plane). Tees are not
  // granted H1.3, but the field is part of the contract.
  const MnNoLTB = Math.min(Mp, MnLocal)

  return {
    Mn: Mn * NMM_TO_KNM, Mp: Mp * NMM_TO_KNM,
    Lp, Lr, governing, cls: cf.cls,
    MnNoLTB: MnNoLTB * NMM_TO_KNM,
    outOfScope,
  }
}

// ── Single angle (F10) ───────────────────────────────────────────────────────

/**
 * AISC F10 — single angles, computed on the PRINCIPAL axes.
 *
 * Returns a capacity for each principal axis, because a single geometric moment
 * resolves into both. `Mn` reports the major-axis value so generic consumers
 * (the canvas, the report deck) still see something meaningful, but the actual
 * check is H2 on the pair.
 *
 * `SwMin`/`SzMin` are the moduli to the WORST extreme fibre about each axis,
 * taken over every real polygon vertex — heel included, which is what CSI's
 * manual asks for (p. 3-68: "considering the possibility of yielding at the heel
 * and both of the leg tips"). SAP2000 agrees exactly on the minor axis: its
 * `McMinor` reproduces `1.5·Fy·SzMin` to five decimal places on an
 * L100×100×10, and that value is set by the HEEL.
 *
 * On the MAJOR axis SAP diverges, and the reason is now measured rather than
 * guessed: it evaluates F10 on the thin-walled two-line idealisation, so its
 * extreme fibre sits at the leg-tip MID-THICKNESS (|z| = 67.175 mm) instead of
 * the real outer corner (70.711 mm). Ours is the true extreme fibre and is
 * therefore smaller — conservative. See DESIGN_STEEL.md §S14.1 C and
 * validation/sap2000-bridge/probe_angle_ltb.py.
 */
function angleShape(inp: FlexureInput): FlexureResult {
  const { g, Fy, E, Lb, A, principal } = inp
  const cf = classifyFlexure(g, Fy, E)

  if (!principal || !(A && A > 0)) {
    return {
      Mn: 0, Mp: 0, governing: "yielding", cls: cf.cls, MnNoLTB: 0,
      outOfScope:
        "Single angle is missing the principal-axis properties (Iw, Iz, βw) " +
        "AISC F10 requires. Re-create the section in the MATERIAL tool.",
    }
  }

  const { rz, SwMin, SzMin } = principal
  const t = Math.min(g.tf, g.tw) // leg thickness (CSI §3.5.3.8.2: t = min(tb, tf))

  // Cb = 1.0 for single angles.
  //
  // CSI's manual (p. 3-67) says Cb comes from F1-1 capped at 1.5, but SAP2000
  // itself uses 1.0 — and that is now MEASURED, not inferred from the PMM
  // table's Cb column. The same equal-leg angle was run at one span under three
  // load patterns whose F1-1 values are 1.136 (UDL), 1.316 (midspan point) and
  // 2.27→1.5 (cantilever tip): all three returned McMajor = 11.8068 kN·m,
  // identical to five decimal places. Mcr is linear in Cb, so computing it from
  // the moment diagram would put us up to 50 % above SAP with no code basis for
  // the extra capacity.
  //
  // 1.0 is what F1 explicitly permits as the conservative value, and matches
  // this engine's policy of falling back to 1.0 whenever the unbraced segment
  // cannot be resolved (see `memberCb` in strategy.ts).
  // See validation/sap2000-bridge/probe_angle_ltb.py.
  const Cb = 1.0

  // AISC F10.2: βw is positive with the short leg in compression and negative
  // with the long leg in compression. Our 2D check cannot know which toe is in
  // compression over the whole unbraced length — and both principal moment signs
  // occur along a real member — so we take the adverse value, which is what CSI
  // does too ("conservatively taken as negative for unequal-leg angles").
  const betaW = -Math.abs(principal.betaW)

  /** Leg local buckling, F10-6..F10-8, on the worse of the two legs. */
  const legLocal = (Sc: number): number => {
    const el = cf.elements.reduce((a, b) => (b.lambda > a.lambda ? b : a))
    const lam = el.lambda
    if (el.cls === "compact") return 1.5 * Fy * Sc // F10-6
    if (el.cls === "noncompact") return Fy * Sc * (2.43 - 1.72 * lam * Math.sqrt(Fy / E)) // F10-7
    return ((0.71 * E) / lam ** 2) * Sc // F10-8
  }

  // ── Major principal axis (w) — yielding, LTB, leg local buckling ──────────
  const MyW = Fy * SwMin
  let MnW = 1.5 * MyW // F10-1
  let governing: FlexureResult["governing"] = "yielding"

  if (Lb > 0) {
    // F10-4. With βw = 0 (equal legs) the bracket collapses to 1 and this
    // reduces to Mcr = 9EA·rz·t·Cb/(8Lb).
    //
    // That collapsed form is the same equation AISC 360-05/10 printed as F10-5,
    //     Me = 0.46·E·b²·t²·Cb/Lb
    // because 0.46 is just 9/8 · 2/√24 = 0.45928, i.e. 9A·rz·t/8 evaluated in
    // the thin-wall limit A → 2bt, rz → b/√24. SAP2000 still uses the 0.46
    // shortcut; 360-16 writes it in terms of the ACTUAL Ag, rz and t, which is
    // what we use. On an L100×100×10 that is 84 039 vs 92 000 kN·m·mm — ours
    // 9.5 % lower, i.e. conservative. Measured across 5 spans × 3 thicknesses ×
    // 3 leg sizes to within 0.09 %; see DESIGN_STEEL.md §S14.1 C.
    const k = (4.4 * betaW * rz) / (Lb * t)
    const Mcr = ((9 * E * A * rz * t * Cb) / (8 * Lb)) * (Math.sqrt(1 + k * k) + k)
    if (Mcr > 0) {
      const ratio = MyW / Mcr
      const MnLtb =
        ratio <= 1.0
          ? Math.min(1.5 * MyW, (1.92 - 1.17 * Math.sqrt(ratio)) * MyW) // F10-2
          : (0.92 - 0.17 / ratio) * Mcr // F10-3, written with Mcr/My = 1/ratio
      if (MnLtb < MnW) {
        MnW = MnLtb
        governing = ratio <= 1.0 ? "LTB-inelastic" : "LTB-elastic"
      }
    }
  }
  const MnWLocal = legLocal(SwMin)
  if (MnWLocal < MnW) {
    MnW = MnWLocal
    governing = "LLB"
  }

  // ── Minor principal axis (z) — yielding + leg local buckling only ─────────
  // "The nominal flexural strength for bending about the minor principal axis
  // for the limit state of lateral-torsional buckling is not needed because the
  // limit state of LTB does not apply for minor axis bending" (CSI §3.5.3.8.2).
  const MnZ = Math.min(1.5 * Fy * SzMin, legLocal(SzMin))

  return {
    Mn: MnW * NMM_TO_KNM,
    Mp: 1.5 * MyW * NMM_TO_KNM, // F10-1 yielding limit stands in for "Mp"
    governing, cls: cf.cls,
    MnNoLTB: Math.min(1.5 * MyW, MnWLocal) * NMM_TO_KNM,
    MnW: MnW * NMM_TO_KNM,
    MnZ: MnZ * NMM_TO_KNM,
  }
}

export function flexuralStrength(inp: FlexureInput): FlexureResult {
  switch (inp.g.kind) {
    case "iwf": return iShape(inp)
    case "rhs": return boxShape(inp)
    case "chs": return roundShape(inp)
    case "tee": return teeShape(inp)
    case "angle": return angleShape(inp)
    default:
      throw new Error(`flexuralStrength: shape ${inp.g.kind} not supported`)
  }
}
