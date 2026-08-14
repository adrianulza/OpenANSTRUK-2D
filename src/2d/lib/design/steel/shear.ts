/**
 * AISC 360-16 Chapter G — shear in the major direction.
 *
 *   G2  I-shapes:        Vn = 0.6·Fy·Aw·Cv1,  Aw = d·tw,  kv = 5.34
 *   G4  rectangular HSS: Vn = 0.6·Fy·Aw·Cv2,  Aw = 2·h·t, kv = 5.0
 *   G5  round HSS:       Vn = Fcr·Ag/2
 *
 * MINOR-DIRECTION SHEAR (G6) IS ABSENT for the same reason as F6: a 2D frame
 * element has no out-of-plane shear.
 *
 * φv NOTE: AISC G2.1(a) allows φv = 1.00 for webs of ROLLED I-shapes with
 * h/tw ≤ 2.24√(E/Fy). Our parametric IWF carries no fillet data and is treated
 * as built-up throughout (see rules.ts), so the general φv = 0.90 is used.
 * That is the conservative choice; taking 1.00 for a welded section would
 * overstate capacity by 11%.
 *
 * Units: mm, MPa, N internally; kN at the boundary.
 */

import type { SteelGeom } from "./rules"

const N_TO_KN = 1e-3

export interface ShearResult {
  /** Nominal shear strength, kN. */
  Vn: number
  /** Web shear coefficient. */
  Cv: number
  /** Shear area used, mm². */
  Aw: number
}

/**
 * Cv1 per AISC G2-3 / G2-4 (I-shapes). Note G2.1(b)(2)(i) fixes kv = 5.34 for
 * webs without transverse stiffeners, which is what we always have.
 */
function cv1(hOverTw: number, kv: number, E: number, Fy: number): number {
  const lim = 1.10 * Math.sqrt((kv * E) / Fy)
  return hOverTw <= lim ? 1.0 : lim / hOverTw
}

/** Cv2 per AISC G2-9 / G2-10 / G2-11 (HSS walls). Three branches. */
function cv2(hOverTw: number, kv: number, E: number, Fy: number): number {
  const a = 1.10 * Math.sqrt((kv * E) / Fy)
  const b = 1.37 * Math.sqrt((kv * E) / Fy)
  if (hOverTw <= a) return 1.0
  if (hOverTw <= b) return a / hOverTw
  return (1.51 * E * kv) / (hOverTw ** 2 * Fy)
}

export function shearStrength(g: SteelGeom, Fy: number, E: number, Ag: number): ShearResult {
  if (g.kind === "iwf") {
    // G2.1: Aw is the OVERALL depth times web thickness, not the clear depth.
    const Aw = g.h * g.tw
    const Cv = cv1(g.hw / g.tw, 5.34, E, Fy)
    return { Vn: 0.6 * Fy * Aw * Cv * N_TO_KN, Cv, Aw }
  }
  if (g.kind === "rhs") {
    // G4: two webs carry the shear.
    const Aw = 2 * g.hw * g.tw
    const Cv = cv2(g.hw / g.tw, 5.0, E, Fy)
    return { Vn: 0.6 * Fy * Aw * Cv * N_TO_KN, Cv, Aw }
  }
  if (g.kind === "chs") {
    // G5: Vn = Fcr·Ag/2 with Fcr = 0.78E/(D/t)^1.5 ≤ 0.6Fy.
    // The code permits the larger of two Fcr expressions; CSI uses only this
    // one, and so do we - the difference is conservative.
    const Dt = (g.D ?? g.h) / g.tf
    const Fcr = Math.min(0.6 * Fy, (0.78 * E) / Math.pow(Dt, 1.5))
    return { Vn: ((Fcr * Ag) / 2) * N_TO_KN, Cv: Fcr / (0.6 * Fy), Aw: Ag / 2 }
  }
  if (g.kind === "tee") {
    // G3 (CSI §3.5.4.1.2): Vn = 0.6·Fy·Aw·Cv2 with kv = 1.2 — far below an
    // I-shape's 5.34, because a tee stem is unstiffened along its free lower
    // edge rather than framed between two flanges. Aw = d·tw on the FULL
    // nominal depth.
    const Aw = g.h * g.tw
    const Cv = cv2(g.hw / g.tw, 1.2, E, Fy)
    return { Vn: 0.6 * Fy * Aw * Cv * N_TO_KN, Cv, Aw }
  }
  if (g.kind === "angle") {
    // G3: Aw = b·t on the leg PARALLEL to the shear. Chapter G is evaluated on
    // the GEOMETRIC axes even for an angle — "The nominal shear strengths are
    // calculated for shears along the geometric axes for all sections"
    // (CSI §3.5.4) — so in-plane shear (local-2) is carried by the vertical
    // leg, which `steelGeom` puts in `hw`/`tw`.
    const Aw = g.hw * g.tw
    const Cv = cv2(g.hw / g.tw, 1.2, E, Fy)
    return { Vn: 0.6 * Fy * Aw * Cv * N_TO_KN, Cv, Aw }
  }
  throw new Error(`shearStrength: shape ${g.kind} not supported`)
}
