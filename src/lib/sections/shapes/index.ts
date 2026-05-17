import type { SectionShape } from "@/lib/model"
import type { ShapeDef } from "./types"
import { rectangle } from "./rectangle"
import { circle } from "./circle"
import { iwf } from "./iwf"
import { tsection } from "./tee"
import { lsection } from "./angle"
import { chs } from "./chs"
import { rhs } from "./rhs"

export type { ShapeDef, SectionProperties } from "./types"

export const SHAPES: Record<SectionShape, ShapeDef> = {
  rect: rectangle,
  circle,
  iwf,
  tee: tsection,
  angle: lsection,
  chs,
  rhs,
}

export function shapeDef(kind: SectionShape): ShapeDef {
  return SHAPES[kind]
}
