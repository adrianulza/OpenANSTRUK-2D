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
  const all = sections ? Object.values(sections) : []
  const parametric = all.filter((s) => s.mode === "parametric")
  const manual     = all.filter((s) => s.mode !== "parametric")

  return (
    <div className="space-y-2">
      <Label className="text-xs text-gray-600">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange?.(v)}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Select section" />
        </SelectTrigger>
        <SelectContent>
          {parametric.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-[10px] uppercase tracking-wider text-gray-500">
                Parametric
              </SelectLabel>
              {parametric.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectGroup>
          )}
          {parametric.length > 0 && manual.length > 0 && <SelectSeparator />}
          {manual.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-[10px] uppercase tracking-wider text-gray-500">
                Manual
              </SelectLabel>
              {manual.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>
    </div>
  )
}

export function fmt(v: number): string {
  return parseFloat(v.toPrecision(6)).toString()
}
