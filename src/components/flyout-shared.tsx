import type { Section, SectionId } from "@/lib/model"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Simple flat section dropdown used by Model-tab tools. The richer grouped
// variant for the Material tool lives in @/tabs/model/tools/material/section-select.
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
  const items = sections
    ? Object.values(sections)
    : [
        { id: "iwf150", name: "IWF 150" },
        { id: "iwf200", name: "IWF 200" },
        { id: "wf300",  name: "WF 300"  },
      ]
  return (
    <div className="space-y-2">
      <Label className="text-xs text-gray-600">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange?.(v)}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Select section" />
        </SelectTrigger>
        <SelectContent>
          {items.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
