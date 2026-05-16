import * as React from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Section } from "@/lib/model"
import type { UnitSettings } from "@/lib/units"
import {
  displayE, parseE, labelE,
  displayI, parseI, labelI,
  displayA, parseA, labelA,
} from "@/lib/units"
import { fmt } from "./section-select"

export interface ManualFields {
  E:     string
  I33:   string
  A:     string
  nu:    string
  "Aκ2": string
  gamma: string
}

export interface ManualValidation {
  invalidE:     boolean
  invalidI33:   boolean
  invalidA:     boolean
  invalidNu:    boolean
  "invalidAκ2": boolean
  invalidGamma: boolean
  isValid:      boolean
}

export function manualFieldsFromSection(s: Section, u: UnitSettings): ManualFields {
  const aκ2 = s["Aκ2"]
  return {
    E:     fmt(displayE(s.E, u)),
    I33:   fmt(displayI(s.I33, u)),
    A:     fmt(displayA(s.A, u)),
    nu:    fmt(s.nu ?? 0.3),
    "Aκ2": aκ2 != null ? fmt(displayA(aκ2, u)) : "0",
    gamma: s.gamma != null ? fmt(s.gamma) : "0",
  }
}

export function validateManual(f: ManualFields): ManualValidation {
  const numPos    = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 }
  const numNuOK   = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 && n < 0.5 }
  const numGeZero = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 }
  const invalidE     = !numPos(f.E)
  const invalidI33   = !numPos(f.I33)
  const invalidA     = !numPos(f.A)
  const invalidNu    = !numNuOK(f.nu)
  const aκ2str = f["Aκ2"].trim(); const aκ2val = parseFloat(aκ2str)
  const invalidAκ2   = aκ2str !== "" && aκ2val !== 0 && !numPos(f["Aκ2"])
  const invalidGamma = !numGeZero(f.gamma)
  return {
    invalidE, invalidI33, invalidA, invalidNu, "invalidAκ2": invalidAκ2, invalidGamma,
    isValid: !invalidE && !invalidI33 && !invalidA && !invalidNu && !invalidAκ2 && !invalidGamma,
  }
}

export function parseManualFields(f: ManualFields, u: UnitSettings): Partial<Section> {
  const out: Partial<Section> = {
    E:     parseE(parseFloat(f.E), u),
    I33:   parseI(parseFloat(f.I33), u),
    A:     parseA(parseFloat(f.A), u),
    nu:    parseFloat(f.nu),
    gamma: parseFloat(f.gamma),
  }
  const aκ2v = parseFloat(f["Aκ2"].trim())
  if (f["Aκ2"].trim() !== "" && aκ2v !== 0) out["Aκ2"] = parseA(aκ2v, u)
  return out
}

interface Props {
  fields: ManualFields
  onChange: (next: ManualFields) => void
  validation: ManualValidation
  u: UnitSettings
}

export function ManualForm({ fields, onChange, validation, u }: Props) {
  const set = (key: keyof ManualFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...fields, [key]: e.target.value })

  const field = (
    label: string,
    key: keyof ManualFields,
    unit: string,
    invalid: boolean,
    invalidMessage = "Enter a valid positive value",
  ) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-600">{label}</Label>
      <div className="flex gap-2">
        <Input
          type="number"
          value={fields[key]}
          onChange={set(key)}
          className={cn("h-7 text-xs font-mono flex-1", invalid && "border-red-400 focus-visible:ring-red-300")}
        />
        {unit && <span className="text-xs text-gray-500 self-center whitespace-nowrap">{unit}</span>}
      </div>
      {invalid && <p className="text-[10px] text-red-500">{invalidMessage}</p>}
    </div>
  )

  return (
    <div className="space-y-3">
      {field("Elastic Modulus, E",         "E",     labelE(u), validation.invalidE)}
      {field("Moment of Inertia, I33",      "I33", labelI(u), validation.invalidI33)}
      {field("Section Area, A",             "A",   labelA(u), validation.invalidA)}
      {field("Poisson Ratio, ν",            "nu",  "",        validation.invalidNu,       "0 < ν < 0.5")}
      {field("Shear Area, Aκ2",             "Aκ2", labelA(u), validation["invalidAκ2"],   "If set, must be > 0")}
      {field("Unit Weight, γ",             "gamma", "kN/m³",   validation.invalidGamma,     "Must be ≥ 0")}
    </div>
  )
}
