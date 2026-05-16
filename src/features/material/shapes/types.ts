import type { SectionShape } from "@/lib/model"

/**
 * Section geometric properties.
 * Naming follows reference software local-axis convention:
 *   axis 1 = along member; axis 3 = strong-axis bending; axis 2 = weak-axis.
 */
export interface SectionProperties {
  A: number      // mm²
  I33: number    // mm⁴  — strong-axis bending inertia
  I22: number    // mm⁴  — weak-axis bending inertia
  S33: number    // mm³  — elastic section modulus, strong
  S22: number    // mm³  — elastic section modulus, weak
  Z33: number    // mm³  — plastic section modulus, strong
  Z22: number    // mm³  — plastic section modulus, weak
  "Aκ2": number  // mm²  — shear area, direction 2 (in-plane)
  "Aκ3": number  // mm²  — shear area, direction 3 (out-of-plane)
  r33: number    // mm   — radius of gyration, strong axis
  r22: number    // mm   — radius of gyration, weak axis
  yBar: number   // mm   — centroid from base
}

export interface ShapeDef {
  kind: SectionShape
  label: string
  dimKeys: readonly string[]
  defaults: Record<string, number>
  validate: (dims: Record<string, number>) => { ok: true } | { ok: false; reason: string }
  compute: (dims: Record<string, number>) => SectionProperties
}
