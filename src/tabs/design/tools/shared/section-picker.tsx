import type { Section, SectionId } from "@/lib/model"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/**
 * The Section row shared by the RC and Steel design panes.
 *
 * Label and control sit on ONE row rather than stacked. A stacked pair spends a
 * whole line on a two-word label and pushes the content that answers the
 * question — the preview, the mode, the results — further down a flyout that is
 * already tall. The row layout is the same one the MATERIAL tool's Type control
 * uses: `shrink-0` on the label so it never wraps, `flex-1 min-w-0` on the
 * control so a long section name truncates inside the trigger instead of
 * pushing it past the flyout's edge.
 *
 * One component rather than the same markup in two panes: the two lists are
 * built from different rules (RC offers designable concrete sections on a
 * member, steel offers steel sections on a member) but they must *look*
 * identical, and duplicated markup is how that stops being true.
 */
export function DesignSectionPicker({
  sections,
  ids,
  value,
  onChange,
  label = "Section",
}: {
  sections: Record<SectionId, Section>
  /** Ids to offer, in display order — each pane applies its own rule. */
  ids: SectionId[]
  value: SectionId | null
  onChange: (id: SectionId) => void
  label?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-gray-600 shrink-0">{label}</Label>
      <Select value={value ?? ""} onValueChange={(v) => onChange(v as SectionId)}>
        {/* `w-full` is not redundant beside `flex-1`: the primitive's base class
            is `w-fit`, and tailwind-merge only displaces a class from the SAME
            group — `flex-1` is a flex class, so `w-fit` would survive. It is
            harmless today (flex-basis wins the main-axis size) but contradicts
            the intent, and would take over the moment this row stopped being a
            flex container. `w-full` is in the width group, so it replaces it. */}
        <SelectTrigger className="h-8 w-full flex-1 min-w-0 text-xs">
          <SelectValue placeholder="Select section…" />
        </SelectTrigger>
        <SelectContent>
          {ids.map((id) => (
            <SelectItem key={id} value={id}>{sections[id].name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
