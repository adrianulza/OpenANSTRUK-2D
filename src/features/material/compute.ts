import type { Section, SectionId, MaterialClass, SectionShape } from "@/lib/model"
import { shapeDef } from "./shapes"
import { materialDef, shearModulus } from "./materials"

export interface ParametricFields {
  materialClass: MaterialClass
  shape:         SectionShape
  dims:          Record<string, number>
  strength:      { fc?: number; fy?: number; fu?: number; E?: number }
}

/** Compute a fully-populated Section patch from parametric fields. */
export function computeSectionFromParametric(f: ParametricFields): Partial<Section> {
  const shape    = shapeDef(f.shape)
  const material = materialDef(f.materialClass)
  const props    = shape.compute(f.dims)
  const matProps = material.compute(f.strength)
  const G = shearModulus(matProps.E, matProps.nu)
  return {
    E:     matProps.E,
    I33:   props.I33,
    A:     props.A,
    nu:    matProps.nu,
    "Aκ2": props["Aκ2"],
    I22:   props.I22,
    "Aκ3": props["Aκ3"],
    gamma: matProps.gamma,
    mode:           "parametric",
    materialClass:  f.materialClass,
    shape:          { kind: f.shape, dims: { ...f.dims } },
    strength:       { ...f.strength },
    derived: {
      G,
      S33b: props.S33b,
      S33t: props.S33t,
      S22L: props.S22L,
      S22R: props.S22R,
      Z33:  props.Z33,
      Z22:  props.Z22,
      r33:  props.r33,
      r22:  props.r22,
      yBar: props.yBar,
    },
  }
}

/** Build a complete `Section` from parametric inputs. Used to seed defaults. */
export function buildParametricSection(args: {
  id: SectionId
  name: string
  materialClass: MaterialClass
  shape: SectionShape
  dims: Record<string, number>
  strength: { fc?: number; fy?: number; fu?: number; E?: number }
}): Section {
  const patch = computeSectionFromParametric({
    materialClass: args.materialClass,
    shape:         args.shape,
    dims:          args.dims,
    strength:      args.strength,
  })
  return {
    id:   args.id,
    name: args.name,
    E:    patch.E!,
    I33:  patch.I33!,
    A:    patch.A!,
    ...patch,
  }
}
