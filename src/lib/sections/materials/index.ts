import type { MaterialClass } from "@/lib/model"
import type { MaterialDef } from "./types"
import { concrete } from "./concrete"
import { steel } from "./steel"

export type { MaterialDef, MaterialProps } from "./types"

export const MATERIALS: Record<MaterialClass, MaterialDef> = {
  concrete,
  steel,
}

export function materialDef(kind: MaterialClass): MaterialDef {
  return MATERIALS[kind]
}

/** Shear modulus from E and ν. */
export function shearModulus(E: number, nu: number): number {
  return E / (2 * (1 + nu))
}
