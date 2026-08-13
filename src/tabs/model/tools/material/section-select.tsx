import * as React from "react"
import type { Section, SectionId } from "@/lib/model"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
// Grouped by material, not by author mode — see section-group.ts for why, and
// why the grouping is pure and lives outside this file.
import { groupSections } from "./section-group"

export function SectionSelect({
  value,
  onChange,
  sections,
  label = "Section",
}: {
  value: SectionId
  onChange?: (id: SectionId) => void
  sections?: Record<string, Section>
  label?: string
}) {
  const groups = React.useMemo(() => groupSections(sections), [sections])

  return (
    <div className="space-y-2">
      <Label className="text-xs text-gray-600">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange?.(v)}>
        {/* w-full: the primitive defaults to w-fit, which would size the box to
            the section name and leave it short of the flyout's right edge. */}
        <SelectTrigger className="h-8 w-full text-xs">
          <SelectValue placeholder="Select section" />
        </SelectTrigger>
        <SelectContent>
          {groups.map((g, i) => (
            <React.Fragment key={g.key}>
              {i > 0 && <SelectSeparator />}
              <SelectGroup>
                <SelectLabel className="text-[10px] uppercase tracking-wider text-gray-500">
                  {g.label}
                </SelectLabel>
                {g.items.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectGroup>
            </React.Fragment>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function fmt(v: number): string {
  return parseFloat(v.toPrecision(6)).toString()
}
