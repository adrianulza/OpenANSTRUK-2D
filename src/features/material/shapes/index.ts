import type { SectionShape } from "@/lib/model"
import type { ShapeDef } from "./types"
import { rectangle } from "./rectangle"
import { circle } from "./circle"
import { iwf } from "./iwf"

export type { ShapeDef, SectionProperties } from "./types"

export const SHAPES: Record<SectionShape, ShapeDef> = {
  rect: rectangle,
  circle,
  iwf,
}

export function shapeDef(kind: SectionShape): ShapeDef {
  return SHAPES[kind]
}
