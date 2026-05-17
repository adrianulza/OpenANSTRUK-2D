// Geometry + segment-splitting helpers shared by the AFD/SFD/BMD diagram drawers.

/**
 * Returns the unit local-2 axis for a member, in world space.
 * Local-1 is the i→j unit vector (c, s) = (dx/L, dy/L).
 * Local-2 = local-1 rotated +90° CCW = (-s, c) = (-dy/L, dx/L).
 * No normalization, no quadrant flip — the same single rule for every member orientation.
 * In screen space the positive local-2 is (l2x, -l2y) due to the Y-axis flip.
 */
export function local2World(ax: number, ay: number, bx: number, by: number): { l2x: number; l2y: number } {
  const dx = bx - ax, dy = by - ay
  const len = Math.hypot(dx, dy)
  return len < 1e-9 ? { l2x: 0, l2y: 1 } : { l2x: -dy / len, l2y: dx / len }
}

export interface DiagramPoint {
  mx: number   // member-axis x in screen px (point on the centreline)
  my: number   // member-axis y in screen px
  dpx: number  // diagram-offset x in screen px (perpendicular offset)
  dpy: number  // diagram-offset y in screen px
}

export interface DiagramSegment {
  member: Array<[number, number]>
  diagram: Array<[number, number]>
  positive: boolean
}

/**
 * Splits a sampled diagram into contiguous positive/negative segments,
 * interpolating zero-crossings between adjacent samples. Used by both
 * shear and moment diagrams (same algorithm, different value field).
 *
 * @param pts  ordered sample points along the member
 * @param valueOf  selector returning the signed value (V for shear, M for moment)
 */
export function splitByZeroCrossings<P extends DiagramPoint>(
  pts: P[],
  valueOf: (p: P) => number,
): DiagramSegment[] {
  const segments: DiagramSegment[] = []
  let current: DiagramSegment | null = null

  const addPoint = (mx: number, my: number, dpx: number, dpy: number) => {
    if (current) {
      current.member.push([mx, my])
      current.diagram.push([mx + dpx, my + dpy])
    }
  }

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const v = valueOf(p)
    const positive = v >= 0
    if (!current || current.positive !== positive) {
      // Close the current segment with an interpolated zero-crossing
      if (current && i > 0) {
        const prev = pts[i - 1]
        const prevV = valueOf(prev)
        if (Math.abs(prevV - v) > 1e-12) {
          const t0 = -prevV / (v - prevV)
          const zx = prev.mx + t0 * (p.mx - prev.mx)
          const zy = prev.my + t0 * (p.my - prev.my)
          current.member.push([zx, zy])
          current.diagram.push([zx, zy])
        }
        segments.push(current)
      }
      current = { member: [], diagram: [], positive }
      // Open the next segment with the same interpolated zero-crossing
      if (i > 0) {
        const prev = pts[i - 1]
        const prevV = valueOf(prev)
        if (Math.abs(prevV - v) > 1e-12) {
          const t0 = -prevV / (v - prevV)
          const zx = prev.mx + t0 * (p.mx - prev.mx)
          const zy = prev.my + t0 * (p.my - prev.my)
          current.member.push([zx, zy])
          current.diagram.push([zx, zy])
        }
      }
    }
    addPoint(p.mx, p.my, p.dpx, p.dpy)
  }
  if (current) segments.push(current)
  return segments
}
