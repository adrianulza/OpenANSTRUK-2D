/**
 * Resolve a `Section` into the property bundle the AISC clause modules need.
 *
 * This exists so the strategy and the report decks read the SAME properties. A
 * deck that re-derived `S33`, `J` or the principal block from `section.derived`
 * itself would be a second, silently-drifting copy of the engine's input
 * mapping — and the whole point of the decks is to show what the check actually
 * used.
 *
 * Pure domain module: no React imports.
 */

import type { PrincipalProperties, Section } from "@/lib/model"
import type { FlexureInput } from "./flexure"
import { steelGeom, type SteelGeom } from "./rules"

export interface SteelSectionProps {
  g: SteelGeom
  Fy: number
  E: number
  /** Shear modulus, MPa. Falls back to E/2(1+ν) with ν = 0.3. */
  G: number
  /** Gross area, mm². */
  Ag: number
  /** Governing (smaller) elastic modulus about axis 3, mm³. */
  S33: number
  /** Opposite-fibre elastic modulus about axis 3, mm³ (tee FLB reads it). */
  S33t?: number
  Z33: number
  I33: number
  I22: number
  J?: number
  Cw?: number
  rts?: number
  ho?: number
  r33: number
  r22: number
  /** Shear-centre offsets from the centroid, geometric axes, mm. */
  x0: number
  y0: number
  principal?: PrincipalProperties
}

/**
 * `undefined` when the section cannot be designed at all — either the shape has
 * no AISC classification mapping, or a property the clauses need is missing or
 * non-positive. The caller decides how loudly to refuse; this never guesses.
 */
export function resolveSteelSection(
  section: Section, fallbackFy: number, fallbackE: number,
): SteelSectionProps | { error: string } {
  const shape = section.shape
  if (!shape) return { error: "Section has no parametric shape." }

  const Fy = section.strength?.fy || fallbackFy
  const E = section.E || fallbackE
  if (!(Fy > 0 && E > 0)) {
    return { error: "Section needs a positive yield stress fy and modulus E." }
  }

  let g: SteelGeom
  try {
    g = steelGeom(shape.kind, shape.dims)
  } catch {
    return {
      error:
        `Steel shape "${shape.kind}" has no AISC classification mapping. ` +
        `Supported: IWF, RHS, CHS, tee, single angle.`,
    }
  }

  const der = section.derived
  const props: SteelSectionProps = {
    g, Fy, E,
    G: der?.G ?? E / (2 * 1.3),
    Ag: section.A,
    S33: der?.S33b ?? 0,
    S33t: der?.S33t,
    Z33: der?.Z33 ?? 0,
    I33: section.I33,
    I22: section.I22 ?? 0,
    J: section.J,
    Cw: der?.Cw,
    rts: der?.rts,
    ho: der?.ho,
    r33: der?.r33 ?? 0,
    r22: der?.r22 ?? 0,
    x0: der?.x0 ?? 0,
    y0: der?.y0 ?? 0,
    principal: der?.principal,
  }

  if (!(props.Ag > 0 && props.S33 > 0 && props.Z33 > 0 && props.r22 > 0 && props.r33 > 0)) {
    return { error: "Section is missing the area / modulus / radius-of-gyration properties AISC needs." }
  }
  return props
}

/** True when `resolveSteelSection` returned a refusal rather than properties. */
export function isSteelPropsError(
  r: SteelSectionProps | { error: string },
): r is { error: string } {
  return "error" in r
}

/**
 * Chapter F input for one unbraced length, `Cb` and moment sign.
 *
 * `Lb` is in **mm**, matching Chapter F. `momentSign` is only read by the tee
 * (F9); every doubly-symmetric shape ignores it.
 */
export function steelFlexureInput(
  p: SteelSectionProps, Lb: number, Cb: number, momentSign: 1 | -1 = 1,
): FlexureInput {
  return {
    g: p.g, Fy: p.Fy, E: p.E,
    S33: p.S33, Z33: p.Z33, I22: p.I22,
    J: p.J, rts: p.rts, ho: p.ho, r22: p.r22,
    Lb, Cb, S33t: p.S33t, momentSign,
    A: p.Ag, principal: p.principal,
  }
}
