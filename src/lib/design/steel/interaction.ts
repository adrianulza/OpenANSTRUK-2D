/**
 * AISC 360-16 Chapter H — combined axial force and flexure.
 *
 * H1-1a  Pr/Pc ≥ 0.2 :  Pr/Pc + (8/9)·(Mr33/Mc33 + Mr22/Mc22) ≤ 1.0
 * H1-1b  Pr/Pc < 0.2 :  Pr/(2Pc) + (Mr33/Mc33 + Mr22/Mc22)   ≤ 1.0
 *
 * The Mr22/Mc22 term is IDENTICALLY ZERO here and is therefore dropped: a 2D
 * frame element has one bending DOF, so minor-axis moment cannot exist. This
 * is a genuine simplification of the code equation for the modelling space,
 * not an omission — there is no input that could make that term non-zero.
 *
 * The same two-branch form serves axial tension (H1.2), with Pc = φt·Pn.
 *
 * H1.3 — checking in-plane instability and out-of-plane buckling separately —
 * is an AISC-vs-CSI divergence, so it is gated by `allowH13` rather than
 * assumed. AISC H1.3 is titled "Doubly Symmetric ROLLED Compact Members" and
 * our parametric IWF is modelled as BUILT-UP throughout (that is why kc and
 * φv = 0.90 are used). CSI's manual §3.6.1 does not repeat the "rolled"
 * restriction and SAP2000 applies the alternative to built-up shapes anyway.
 * Since H1.3 returns a MINIMUM, granting it can only lower the reported D/C —
 * so it defaults OFF (AISC-strict) and is opt-in via
 * `SteelCriteria.h13ForBuiltUp` for users reconciling against SAP2000.
 */

export type InteractionEquation =
  | "H1-1a"
  | "H1-1b"
  | "H1-2"
  /** Unsymmetric section (single angle) or a tee under negative major moment. */
  | "H2-1"
  /** No axial force at all — the check degenerates to Mr33/Mc33. */
  | "flexure-only"
  /** Nothing was evaluated (no combos/stations produced a demand). */
  | "none"

export interface InteractionInput {
  /** Required axial strength, kN. Positive = compression. */
  Pr: number
  /** Available axial strength φPn, kN. Compression value when Pr > 0. */
  PcComp: number
  /** Available axial strength φPn in tension, kN. */
  PcTens: number
  /** Required major-axis flexural strength, kN·m (absolute). */
  Mr33: number
  /** Available major-axis flexural strength φMn, kN·m. */
  Mc33: number
  /** φMn ignoring lateral-torsional buckling, kN·m (H1.3a). */
  Mc33NoLTB?: number
  /** Available out-of-plane compressive strength φPn (weak axis), kN. */
  Pcy?: number
  /**
   * φMn for H1-2 computed with **Cb = 1.0** and capped at φMp, kN·m.
   * AISC H1-2 / CSI §3.6.1(b) is explicit: "Mc33 = available lateral-torsional
   * strength … determined in accordance with Chapter F using Cb = 1.0. The
   * limit of Mp33 is imposed on Mc33." The equation then divides by Cb·Mc33,
   * so passing the Cb-scaled Mn here would apply Cb TWICE and understate the
   * out-of-plane ratio. Falls back to Mc33 only when not supplied.
   */
  Mc33Cb1?: number
  /** Cb used for the H1-2 out-of-plane check. */
  Cb?: number
  /** True when the section is doubly-symmetric and compact (H1.3 gate). */
  allowH13?: boolean
}

export interface InteractionResult {
  ratio: number
  equation: InteractionEquation
  /** Contribution of the axial term (for reporting). */
  pRatio: number
  /** Contribution of the flexural term (for reporting). */
  mRatio: number
}

/** The plain two-branch interaction, given an available axial strength. */
function h11(Pr: number, Pc: number, Mr: number, Mc: number): InteractionResult {
  const p = Pc > 0 ? Math.abs(Pr) / Pc : Infinity
  const m = Mc > 0 ? Mr / Mc : (Mr > 0 ? Infinity : 0)
  if (p >= 0.2) {
    return { ratio: p + (8 / 9) * m, equation: "H1-1a", pRatio: p, mRatio: (8 / 9) * m }
  }
  return { ratio: p / 2 + m, equation: "H1-1b", pRatio: p / 2, mRatio: m }
}

export function interactionRatio(inp: InteractionInput): InteractionResult {
  const { Pr, PcComp, PcTens, Mr33, Mc33 } = inp

  // Pure flexure - no axial term at all.
  if (Math.abs(Pr) < 1e-9) {
    const m = Mc33 > 0 ? Mr33 / Mc33 : (Mr33 > 0 ? Infinity : 0)
    return { ratio: m, equation: "flexure-only", pRatio: 0, mRatio: m }
  }

  const Pc = Pr > 0 ? PcComp : PcTens
  const base = h11(Pr, Pc, Mr33, Mc33)

  // AISC H1.3 - for doubly-symmetric compact members in flexure + COMPRESSION
  // with negligible minor-axis moment, in-plane instability and out-of-plane
  // buckling may be checked separately, and the LOWER of the two approaches
  // governs. Only applies in compression.
  if (!inp.allowH13 || Pr <= 0) return base

  // (a) In-plane instability: same equations, but Mc33 excludes LTB.
  const inPlane = inp.Mc33NoLTB !== undefined
    ? h11(Pr, PcComp, Mr33, inp.Mc33NoLTB)
    : base

  // (b) Out-of-plane buckling (H1-2):
  //     Pr/Pcy·(1.5 − 0.5·Pr/Pcy) + (Mr33/(Cb·Mc33))² ≤ 1.0
  // Mc33 here is the Cb = 1.0 strength capped at φMp (see Mc33Cb1) — Cb enters
  // ONCE, through the explicit factor in the denominator.
  let outOfPlane = base
  if (inp.Pcy !== undefined && inp.Pcy > 0) {
    const py = Pr / inp.Pcy
    const cb = inp.Cb && inp.Cb > 0 ? inp.Cb : 1.0
    const McOut = inp.Mc33Cb1 ?? Mc33
    const mTerm = McOut > 0 ? Mr33 / (cb * McOut) : (Mr33 > 0 ? Infinity : 0)
    const ratio = py * (1.5 - 0.5 * py) + mTerm ** 2
    outOfPlane = { ratio, equation: "H1-2", pRatio: py * (1.5 - 0.5 * py), mRatio: mTerm ** 2 }
  }

  const alt = inPlane.ratio <= outOfPlane.ratio ? inPlane : outOfPlane
  // H1.3 permits the alternative only if it is LESS than the H1-1 result.
  return alt.ratio < base.ratio ? alt : base
}

// ── H2 — unsymmetric members ────────────────────────────────────────────────

export interface H2Input {
  /** Required axial strength, kN. Positive = compression. */
  Pr: number
  PcComp: number
  PcTens: number
  /** Required flexural strengths about the two principal axes, kN·m (absolute). */
  MrW: number
  MrZ: number
  /** Available flexural strengths φMn about those axes, kN·m. */
  McW: number
  McZ: number
}

/**
 * AISC H2 — unsymmetric members, and singly symmetric members outside H1's
 * scope. Applied to every single angle, and to a tee under NEGATIVE major-axis
 * moment (CSI §3.6.2: "any T-Shape or Double-Angle shape when subjected to
 * negative major axis moment is checked using the equation given in Section H2").
 *
 *     | f_ra/F_ca + f_rbw/F_cbw + f_rbz/F_cbz |  ≤  1.0            (H2-1)
 *
 * H2-1 is written in STRESSES, but each flexural term is
 * `(Mr/S) / (φMn/S)` — the section modulus cancels identically, so the check
 * reduces to the moment form used here. That is an algebraic identity, not an
 * approximation.
 *
 * Terms are summed as ABSOLUTE ratios, i.e. every component taken adverse. The
 * signed alternative would evaluate H2-1 at each extreme fibre and could let two
 * terms partially cancel, but that only makes sense paired with per-fibre
 * capacities; ours are already the minimum over all extreme fibres (see
 * `flexure.ts::angleShape`). SAP2000 does the same: its PMM table reports
 * `TotalRatio = PRatio + MMajRatio + MMinRatio` as a plain linear sum
 * (0.197339 + 0.165518 = 0.362857 on the validation angle), so this matches
 * measured behaviour and is not merely the conservative choice.
 */
export function h2Ratio(inp: H2Input): InteractionResult {
  const { Pr, PcComp, PcTens, MrW, MrZ, McW, McZ } = inp
  const Pc = Pr > 0 ? PcComp : PcTens

  const term = (r: number, c: number) => (c > 0 ? Math.abs(r) / c : Math.abs(r) > 0 ? Infinity : 0)
  const p = Math.abs(Pr) < 1e-9 ? 0 : term(Pr, Pc)
  const mw = term(MrW, McW)
  const mz = term(MrZ, McZ)

  return { ratio: p + mw + mz, equation: "H2-1", pRatio: p, mRatio: mw + mz }
}
