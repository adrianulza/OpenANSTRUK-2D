/**
 * Rectangle-composition geometry engine — area, inertia, principal axes and the
 * third-order moments AISC F10 needs for single angles.
 *
 * Every shape that is a union of axis-aligned rectangles (angle, tee) can be
 * described exactly here, so nothing in this module is an approximation or a
 * numeric quadrature: for a rectangle spanning [x1,x2]x[y1,y2],
 *
 *     ∫ x^m y^n dA  =  (x2^(m+1) − x1^(m+1))/(m+1) · (y2^(n+1) − y1^(n+1))/(n+1)
 *
 * which is the single primitive `moment()` below. Area, first, second and third
 * moments are all special cases of it.
 *
 * Pure domain module: no React imports, no `Section` dependency.
 */

/** Axis-aligned rectangle. `x2 > x1`, `y2 > y1` (not enforced — callers build them). */
export interface Rect {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface Pt {
  x: number
  y: number
}

/** Principal-coordinate pair. `w` = major principal axis, `z` = minor. */
export interface WZ {
  w: number
  z: number
}

/**
 * Area moments of a rectangle composition. Everything except `xBar`/`yBar` is
 * referred to the CENTROID; `xBar`/`yBar` locate that centroid in the input
 * (caller's) coordinate frame.
 */
export interface AreaMoments {
  A: number
  xBar: number
  yBar: number
  /** Second moments about the centroid. `Ix = ∫y²dA`, `Iy = ∫x²dA`, `Ixy = ∫xy dA`. */
  Ix: number
  Iy: number
  Ixy: number
  /** Third moments about the centroid: `∫x³`, `∫x²y`, `∫xy²`, `∫y³`. */
  M30: number
  M21: number
  M12: number
  M03: number
}

/** ∫ x^m·y^n dA over one rectangle, in the rectangle's own input frame. */
function moment(r: Rect, m: number, n: number): number {
  const fx = (r.x2 ** (m + 1) - r.x1 ** (m + 1)) / (m + 1)
  const fy = (r.y2 ** (n + 1) - r.y1 ** (n + 1)) / (n + 1)
  return fx * fy
}

/**
 * Area, centroid, second and third moments of a rectangle composition.
 * Rectangles are given in any convenient frame; results are shifted to the
 * centroid by re-evaluating `moment()` on centroid-relative bounds, which keeps
 * the third moments exact rather than pushing them through parallel-axis terms.
 */
export function rectMoments(rects: Rect[]): AreaMoments {
  let A = 0
  let Sx = 0 // ∫x dA
  let Sy = 0 // ∫y dA
  for (const r of rects) {
    A += moment(r, 0, 0)
    Sx += moment(r, 1, 0)
    Sy += moment(r, 0, 1)
  }
  const xBar = A > 0 ? Sx / A : 0
  const yBar = A > 0 ? Sy / A : 0

  let Ix = 0
  let Iy = 0
  let Ixy = 0
  let M30 = 0
  let M21 = 0
  let M12 = 0
  let M03 = 0
  for (const r of rects) {
    const c: Rect = { x1: r.x1 - xBar, y1: r.y1 - yBar, x2: r.x2 - xBar, y2: r.y2 - yBar }
    Ix += moment(c, 0, 2)
    Iy += moment(c, 2, 0)
    Ixy += moment(c, 1, 1)
    M30 += moment(c, 3, 0)
    M21 += moment(c, 2, 1)
    M12 += moment(c, 1, 2)
    M03 += moment(c, 0, 3)
  }
  return { A, xBar, yBar, Ix, Iy, Ixy, M30, M21, M12, M03 }
}

export interface PrincipalAxes {
  /** Rotation of the MAJOR principal axis (w) from the geometric x-axis, radians CCW. */
  alpha: number
  /** Major principal moment of inertia (the larger). mm⁴ */
  Iw: number
  /** Minor principal moment of inertia (the smaller). mm⁴ */
  Iz: number
}

/**
 * Principal axes from the centroidal second moments.
 *
 * `I(α) = Ix·cos²α + Iy·sin²α − 2·Ixy·sinα·cosα`, maximised at
 * `α = ½·atan2(−2·Ixy, Ix − Iy)` — the `atan2` form (rather than `½·atan`)
 * picks the MAJOR axis directly and stays well-defined when `Ix == Iy`, which
 * is exactly the equal-leg angle case where the denominator vanishes and the
 * answer must come out at 45°.
 */
export function principalAxes(Ix: number, Iy: number, Ixy: number): PrincipalAxes {
  const alpha = 0.5 * Math.atan2(-2 * Ixy, Ix - Iy)
  const mean = (Ix + Iy) / 2
  const R = Math.hypot((Ix - Iy) / 2, Ixy)
  return { alpha, Iw: mean + R, Iz: mean - R }
}

/** Geometric (centroidal) point → principal coordinates. */
export function toPrincipal(p: Pt, alpha: number): WZ {
  const c = Math.cos(alpha)
  const s = Math.sin(alpha)
  return { w: p.x * c + p.y * s, z: -p.x * s + p.y * c }
}

export interface FibreExtents {
  wMin: number
  wMax: number
  zMin: number
  zMax: number
}

/**
 * Extreme principal coordinates over a vertex list. Bending about the MAJOR
 * axis (w) produces stress proportional to `z`, so `S_w = Iw / max|z|`;
 * bending about the minor axis uses `max|w|`.
 *
 * Vertices must already be centroid-relative.
 */
export function extremeFibres(vertices: Pt[], alpha: number): FibreExtents {
  let wMin = Infinity
  let wMax = -Infinity
  let zMin = Infinity
  let zMax = -Infinity
  for (const v of vertices) {
    const { w, z } = toPrincipal(v, alpha)
    if (w < wMin) wMin = w
    if (w > wMax) wMax = w
    if (z < zMin) zMin = z
    if (z > zMax) zMax = z
  }
  return { wMin, wMax, zMin, zMax }
}

/**
 * AISC Table C-F10.1 Note [a] monosymmetry property for single angles:
 *
 *     βw = (1/Iw)·∫ z·(w² + z²) dA − 2·z0
 *
 * Evaluated exactly. Expanding `w = x·c + y·s`, `z = −x·s + y·c` turns both
 * integrands into cubics in x and y, so they reduce to the four third moments
 * already carried on `AreaMoments`:
 *
 *     ∫z·w² dA = −s·c²·M30 + (c³ − 2s²c)·M21 + (2c²s − s³)·M12 + c·s²·M03
 *     ∫z³   dA = −s³·M30   + 3s²c·M21        − 3sc²·M12        + c³·M03
 *
 * `βw` is **zero for an equal-leg angle** (the section is symmetric about the
 * major principal axis, so every odd-in-z integrand cancels) — that identity is
 * the cheapest available check that the expansion above is right.
 *
 * @param z0 shear-centre offset from the centroid along the MINOR principal
 *           axis, mm. Zero whenever the section has an axis of symmetry.
 */
export function betaW(m: AreaMoments, alpha: number, Iw: number, z0: number): number {
  if (!(Iw > 0)) return 0
  const c = Math.cos(alpha)
  const s = Math.sin(alpha)

  const intZW2 =
    -s * c * c * m.M30 +
    (c ** 3 - 2 * s * s * c) * m.M21 +
    (2 * c * c * s - s ** 3) * m.M12 +
    c * s * s * m.M03

  const intZ3 =
    -(s ** 3) * m.M30 +
    3 * s * s * c * m.M21 -
    3 * s * c * c * m.M12 +
    c ** 3 * m.M03

  return (intZW2 + intZ3) / Iw - 2 * z0
}

/**
 * St. Venant torsion contribution of one rectangular strip, with the
 * finite-aspect-ratio correction:
 *
 *     J_strip = ⅓·b·t³·(1 − 0.63·t/b)
 *
 * The uncorrected ⅓bt³ overestimates J — by 3.7 % on a 400x200x13x8 I-shape —
 * which flows into Lr and Fcr and inflates the LTB moment capacity. SAP2000's
 * section-property calculator uses the corrected form even though CSI's own
 * hand-calc PDFs quote the uncorrected version; the software is right.
 *
 * The correction is clamped at 0 so a stubby strip (t ≳ 1.6·b) can never
 * produce a negative contribution.
 */
export function torsionStrip(b: number, t: number): number {
  if (!(b > 0 && t > 0)) return 0
  return (b * t ** 3 * Math.max(0, 1 - (0.63 * t) / b)) / 3
}
