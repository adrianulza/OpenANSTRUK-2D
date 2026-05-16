import type { MaterialClass, SectionShape } from "@/lib/model"

export interface MaterialProps {
  E: number      // MPa
  nu: number     // Poisson
  gamma: number  // kN/m³
}

export interface MaterialDef {
  kind: MaterialClass
  label: string
  /** Shape options offered to the user when this material class is chosen. */
  allowedShapes: readonly SectionShape[]
  /** Compute (E, ν, γ) from user inputs. For steel, E is user-supplied. */
  compute: (strength: { fc?: number; fy?: number; fu?: number; E?: number }) => MaterialProps
  /** UI defaults used when the user first switches to this class. */
  defaults: { fc?: number; fy?: number; fu?: number; E?: number }
  validate: (strength: { fc?: number; fy?: number; fu?: number; E?: number }) =>
    | { ok: true }
    | { ok: false; reason: string }
}
