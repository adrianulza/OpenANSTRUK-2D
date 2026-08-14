import type { Section } from "@/lib/model"

/**
 * Sections grouped by MATERIAL, not by author mode.
 *
 * A flat list mixes a concrete beam and a steel IWF as if they were the same
 * kind of thing. They are not: material decides which design path a section can
 * take, what dimensions it carries, and what the rest of the MATERIAL flyout
 * shows. It is the first question a user asks of a section name, so it is the
 * axis the list is cut along.
 *
 * The grouping this replaces — Parametric vs Manual — answered a question about
 * *how the section was authored*, which matters only inside that tool and only
 * while editing. Manual sections carry no material class at all, so they still
 * form their own group; that is a consequence of the material rule, not a second
 * axis bolted on beside it.
 *
 * Pure, and in its own module rather than beside the component: Radix builds its
 * item list inside a portal that exists only while the menu is open, so neither
 * the grouping nor the order is observable from a render. The list is the thing
 * worth asserting. (Keeping it out of the .tsx also satisfies
 * `react-refresh/only-export-components`.)
 */
export type SectionGroupKey = "concrete" | "steel" | "other"

const GROUP_ORDER: SectionGroupKey[] = ["concrete", "steel", "other"]

const GROUP_LABEL: Record<SectionGroupKey, string> = {
  concrete: "Concrete",
  steel: "Steel",
  // Manual sections are E/I/A only — no material was ever declared for them, so
  // naming one here would be an invention.
  other: "Manual",
}

function groupOf(s: Section): SectionGroupKey {
  if (s.materialClass === "concrete") return "concrete"
  if (s.materialClass === "steel") return "steel"
  return "other"
}

// Numeric collation so "IWF 100" sorts before "IWF 200" before "IWF 1000",
// which plain lexicographic ordering gets wrong.
const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })

export interface SectionGroup {
  key: SectionGroupKey
  label: string
  items: Section[]
}

/** The grouped, sorted list the dropdown renders. Empty groups are dropped. */
export function groupSections(
  sections: Record<string, Section> | undefined,
): SectionGroup[] {
  const all = sections ? Object.values(sections) : []
  return GROUP_ORDER.map((key) => ({
    key,
    label: GROUP_LABEL[key],
    items: all
      .filter((s) => groupOf(s) === key)
      .sort((a, b) => byName.compare(a.name, b.name)),
  })).filter((g) => g.items.length > 0)
}
