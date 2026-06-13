/**
 * Per-section design input — discriminated union over material. RC sections
 * carry rebar arrangements; steel sections carry member-design parameters. The
 * default for a section is chosen by its `materialClass`.
 *
 * Pure domain module: no React imports.
 */

import type { Section, SectionId } from "@/lib/model"
import { defaultRcSectionInput, type RcSectionInput } from "../rc/types"
import { defaultSteelSectionInput, type SteelSectionInput } from "../steel/types"

export type SectionDesignInput = RcSectionInput | SteelSectionInput
export type SectionDesignInputs = Record<SectionId, SectionDesignInput>

/** Default input for a section, dispatched by material class (steel → steel
 *  input, anything else → RC input). */
export function defaultSectionDesignInput(
  sectionId: SectionId,
  section?: Section,
): SectionDesignInput {
  return section?.materialClass === "steel"
    ? defaultSteelSectionInput(sectionId)
    : defaultRcSectionInput(sectionId)
}

/** Narrow a union input to RC, materialising a default when absent/mismatched. */
export function asRcInput(input: SectionDesignInput | undefined, sectionId: SectionId): RcSectionInput {
  return input && input.material === "rc" ? input : defaultRcSectionInput(sectionId)
}

/** Narrow a union input to steel, materialising a default when absent/mismatched. */
export function asSteelInput(input: SectionDesignInput | undefined, sectionId: SectionId): SteelSectionInput {
  return input && input.material === "steel" ? input : defaultSteelSectionInput(sectionId)
}
