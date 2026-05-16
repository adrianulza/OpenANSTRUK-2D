import type { SectionShape } from "@/lib/model"
import type { ShapeDef } from "./types"
import { rectangle } from "./rectangle"
import { circle } from "./circle"
import { iwf } from "./iwf"
import { tsection } from "./tsection"
import { lsection } from "./lsection"
import { pipe } from "./pipe"
import { rhs } from "./rhs"

export type { ShapeDef, SectionProperties } from "./types"

export const SHAPES: Record<SectionShape, ShapeDef> = {
  rect: rectangle,
  circle,
  iwf,
  tsection,
  lsection,
  pipe,
  rhs,
}

export function shapeDef(kind: SectionShape): ShapeDef {
  return SHAPES[kind]
}
