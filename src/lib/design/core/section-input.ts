/**
 * Per-section design input.
 *
 * **RC only.** Steel sections carry no design input at all — every quantity AISC
 * needs beyond the section geometry is computed or fixed by convention (see
 * `steel/types.ts`), so there is nothing per-section to store. The type was a
 * discriminated union over material until steel's last field was removed.
 *
 * It is kept as a named alias rather than collapsed to `RcSectionInput` at every
 * call site, because AISC 341 will reintroduce a steel input — though a
 * per-MEMBER one (SFRS membership), which is a different map, not a new arm of
 * this union.
 *
 * Pure domain module: no React imports.
 */

import type { SectionId } from "@/lib/model"
import { defaultRcSectionInput, type RcSectionInput } from "../rc/types"

export type SectionDesignInput = RcSectionInput
export type SectionDesignInputs = Record<SectionId, SectionDesignInput>

/**
 * Default input for a section. Steel sections get an RC-shaped default that is
 * never read — `run-design.ts` routes them to the steel strategy, which takes no
 * `di` at all. Materialising one keeps the map total, so callers never have to
 * special-case a missing key.
 */
export function defaultSectionDesignInput(sectionId: SectionId): SectionDesignInput {
  return defaultRcSectionInput(sectionId)
}

/** Narrow to RC, materialising a default when absent. */
export function asRcInput(
  input: SectionDesignInput | undefined,
  sectionId: SectionId,
): RcSectionInput {
  return input ?? defaultRcSectionInput(sectionId)
}
