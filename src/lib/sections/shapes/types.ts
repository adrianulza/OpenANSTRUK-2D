import type { PrincipalProperties, SectionShape } from "@/lib/model"

export type { PrincipalProperties }

/**
 * Section geometric properties.
 * Naming follows SAP2000 local-axis convention:
 *   axis 1 = along member; axis 3 = strong-axis bending; axis 2 = weak-axis.
 */
export interface SectionProperties {
  A: number      // mm²
  I33: number    // mm⁴  — strong-axis bending inertia
  I22: number    // mm⁴  — weak-axis bending inertia
  S33b: number   // mm³  — elastic section modulus, axis 3 (bottom fibre, governing)
  S33t: number   // mm³  — elastic section modulus, axis 3 (top fibre)
  S22L: number   // mm³  — elastic section modulus, axis 2 (left fibre)
  S22R: number   // mm³  — elastic section modulus, axis 2 (right fibre)
  Z33: number    // mm³  — plastic section modulus, strong
  Z22: number    // mm³  — plastic section modulus, weak
  "Aκ2": number  // mm²  — shear area, direction 2 (in-plane)
  "Aκ3": number  // mm²  — shear area, direction 3 (out-of-plane)
  r33: number    // mm   — radius of gyration, strong axis
  r22: number    // mm   — radius of gyration, weak axis
  yBar: number   // mm   — centroid from base

  // ── Torsional / warping (steel design, AISC 360-16) ────────────────────────
  // Optional: populated only where a closed form exists for the shape. The
  // steel flexure path skips lateral-torsional buckling when they are absent
  // rather than substituting a guess.
  J?: number     // mm⁴  — St. Venant torsional constant
  Cw?: number    // mm⁶  — warping constant
  rts?: number   // mm   — effective radius of gyration for LTB (AISC F2-7)
  ho?: number    // mm   — distance between flange centroids

  // ── Shear centre (AISC E4 flexural-torsional buckling) ─────────────────────
  // Offset of the shear centre from the centroid, in GEOMETRIC section axes.
  // Zero on both counts for a doubly-symmetric shape, so E4-2 needs neither.
  x0?: number    // mm   — along axis 3 (horizontal)
  y0?: number    // mm   — along axis 2 (vertical)

  /**
   * Principal-axis block — populated ONLY for shapes whose principal axes
   * differ from their geometric axes, which in this catalogue means the single
   * angle. Its presence is what tells the steel path to resolve the member's
   * geometric M33 into two principal components and check AISC H2 instead of
   * H1 (see `docs/DESIGN_STEEL.md` §S8.2).
   */
  principal?: PrincipalProperties
}

export interface ShapeDef {
  kind: SectionShape
  label: string
  dimKeys: readonly string[]
  defaults: Record<string, number>
  validate: (dims: Record<string, number>) => { ok: true } | { ok: false; reason: string }
  compute: (dims: Record<string, number>) => SectionProperties
}
