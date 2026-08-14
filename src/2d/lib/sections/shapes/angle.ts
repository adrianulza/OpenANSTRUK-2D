import type { ShapeDef, SectionProperties } from "./types"
import {
  betaW as betaWOf,
  extremeFibres,
  principalAxes,
  rectMoments,
  toPrincipal,
  torsionStrip,
  type Pt,
  type Rect,
} from "./principal"

/**
 * Single angle (L-section), equal or unequal legs.
 *
 * Dims (all in mm):
 *   b — horizontal leg length (along geometric axis 3)
 *   d — vertical   leg length (along geometric axis 2).  Optional: omitted ⇒ d = b
 *   t — leg thickness (both legs)
 *
 * Geometry, heel at the origin:
 *   horizontal leg  (0,0) → (b, t)
 *   vertical   leg  (0,t) → (t, d)
 *
 * `yBar` is measured from the bottom (the outer face of the horizontal leg).
 *
 * ── Why this shape carries a `principal` block ──────────────────────────────
 * An angle is the one shape in this catalogue whose principal axes do NOT
 * coincide with its geometric axes — they sit at `alpha` to them (exactly 45°
 * when the legs are equal). The solver bends every member about the GEOMETRIC
 * axis 3, so a moment that looks uniaxial to the analysis is genuinely biaxial
 * to the section, and AISC F10/H2 are written on the principal pair. `I33`/`I22`
 * below therefore remain the geometric values the solver needs, and everything
 * the steel design path needs lives in `principal`.
 *
 * `d` defaults to `b` so sections saved before unequal legs existed (dims were
 * `{b, t}` only) still load and still describe the same equal-leg angle.
 */

/**
 * Plastic section modulus of the L about an axis perpendicular to the `dLeg`
 * direction, with the section laid out as a `bLeg`-wide × `t`-tall foot and a
 * `t`-wide × `(dLeg − t)`-tall riser.
 *
 * Both PNA branches are live once legs may be unequal: the plastic neutral axis
 * sits in the foot when `dLeg ≤ bLeg + t` and in the riser otherwise.
 */
function plasticZ(bLeg: number, dLeg: number, t: number): number {
  const A = t * (bLeg + dLeg - t)
  const half = A / 2
  if (half <= bLeg * t) {
    // PNA inside the foot.
    const yp = half / bLeg
    return (
      (bLeg * yp ** 2) / 2 +
      (bLeg * (t - yp) ** 2) / 2 +
      t * (dLeg - t) * (t + (dLeg - t) / 2 - yp)
    )
  }
  // PNA inside the riser.
  const yp = t + (half - bLeg * t) / t
  return bLeg * t * (yp - t / 2) + (t * (yp - t) ** 2) / 2 + (t * (dLeg - yp) ** 2) / 2
}

function compute(dims: Record<string, number>): SectionProperties {
  const b = dims.b
  const t = dims.t
  const d = dims.d ?? b // back-compat: pre-unequal-leg sections stored {b, t}

  const rects: Rect[] = [
    { x1: 0, y1: 0, x2: b, y2: t }, // horizontal leg
    { x1: 0, y1: t, x2: t, y2: d }, // vertical leg (above the horizontal one)
  ]
  const m = rectMoments(rects)
  const { A, xBar, yBar, Ix, Iy, Ixy } = m

  // Geometric axes — what the 2D solver uses.
  const I33 = Ix
  const I22 = Iy

  // Elastic moduli about the geometric axes. "b"/"L" name the y=0 / x=0 faces
  // (the heel side); for an angle the far toe is the governing fibre, so S33t
  // and S22R are the smaller pair — the opposite of the tee, where the stem tip
  // sits on the "b" side. The steel path never reads these for an angle: F10
  // works on `principal.SwMin` / `SzMin`.
  const S33b = I33 / yBar
  const S33t = I33 / (d - yBar)
  const S22L = I22 / xBar
  const S22R = I22 / (b - xBar)

  const Z33 = plasticZ(b, d, t)
  const Z22 = plasticZ(d, b, t) // mirror across the 45° line: legs swap roles

  // Shear areas — each leg resists shear parallel to itself.
  const Aκ2 = d * t // in-plane (vertical) shear → vertical leg
  const Aκ3 = b * t // out-of-plane (horizontal) shear → horizontal leg

  const r33 = Math.sqrt(I33 / A)
  const r22 = Math.sqrt(I22 / A)

  // ── Torsional / warping ────────────────────────────────────────────────────
  // Strip lengths sum to b + (d − t) = A/t, the same "full foot + clear riser"
  // split iwf.ts uses for its flanges and web, so the two shapes stay consistent
  // about what the finite-aspect correction is applied to.
  const J = torsionStrip(b, t) + torsionStrip(d - t, t)
  // Thin-walled open section made of two strips meeting at the shear centre:
  // Cw = (t³/36)·(b₁³ + b₂³) on mid-line leg lengths. Small — AISC often takes
  // it as zero for angles — but it is a closed form, so we carry it rather than
  // drop a term.
  const b1 = b - t / 2
  const b2 = d - t / 2
  const Cw = (t ** 3 / 36) * (b1 ** 3 + b2 ** 3)

  // Shear centre: intersection of the two leg mid-lines, i.e. (t/2, t/2).
  const x0 = t / 2 - xBar
  const y0 = t / 2 - yBar

  // ── Principal axes ─────────────────────────────────────────────────────────
  const { alpha, Iw, Iz } = principalAxes(Ix, Iy, Ixy)
  const rw = Math.sqrt(Iw / A)
  const rz = Math.sqrt(Iz / A)

  // The six corners of the L, centroid-relative.
  const vertices: Pt[] = (
    [
      [0, 0],
      [b, 0],
      [b, t],
      [t, t],
      [t, d],
      [0, d],
    ] as const
  ).map(([x, y]) => ({ x: x - xBar, y: y - yBar }))

  const ext = extremeFibres(vertices, alpha)
  const zMaxAbs = Math.max(Math.abs(ext.zMin), Math.abs(ext.zMax))
  const wMaxAbs = Math.max(Math.abs(ext.wMin), Math.abs(ext.wMax))
  const SwMin = Iw / zMaxAbs
  const SzMin = Iz / wMaxAbs

  const sc = toPrincipal({ x: x0, y: y0 }, alpha)
  // True geometric βw, as a section-property table would report it. AISC F10.2's
  // "use the negative value when the long leg is in compression" is a DESIGN
  // decision and is applied in `design/steel/flexure.ts`, not baked in here.
  const betaW = betaWOf(m, alpha, Iw, sc.z)

  return {
    A, I33, I22, S33b, S33t, S22L, S22R, Z33, Z22,
    "Aκ2": Aκ2, "Aκ3": Aκ3, r33, r22, yBar,
    J, Cw, x0, y0,
    principal: { alpha, Iw, Iz, rw, rz, SwMin, SzMin, betaW, w0: sc.w, z0: sc.z },
  }
}

export const lsection: ShapeDef = {
  kind: "angle",
  label: "Angle",
  dimKeys: ["b", "d", "t"] as const,
  defaults: { b: 100, d: 100, t: 10 },
  validate: (dims) => {
    const { b, t } = dims
    const d = dims.d ?? b
    if (!(b > 0 && d > 0 && t > 0))
      return { ok: false, reason: "All dimensions must be > 0" }
    if (t >= Math.min(b, d))
      return { ok: false, reason: "Leg thickness must be less than both leg lengths (t < b, t < d)" }
    return { ok: true }
  },
  compute,
}
