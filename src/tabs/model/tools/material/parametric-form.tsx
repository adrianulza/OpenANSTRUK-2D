import * as React from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import type { Section, MaterialClass, SectionShape } from "@/lib/model"
import { SHAPES, shapeDef } from "@/lib/sections/shapes"
import { MATERIALS, materialDef } from "@/lib/sections/materials"
import { ShapePreview } from "./shape-preview"
import { computeSectionFromParametric, type ParametricFields } from "@/lib/sections/compute"

export { computeSectionFromParametric, type ParametricFields }

export interface ParametricValidation {
  shapeError:    string | null
  materialError: string | null
  isValid:       boolean
}

function dimsForShape(mat: ReturnType<typeof materialDef>, shape: SectionShape): Record<string, number> {
  return { ...shapeDef(shape).defaults, ...(mat.shapeDimDefaults?.[shape] ?? {}) }
}

export function defaultParametricFields(materialClass: MaterialClass = "concrete"): ParametricFields {
  const mat = materialDef(materialClass)
  // Default steel to RHS; other materials use their first allowed shape
  const shape = materialClass === "steel" ? "rhs" : mat.allowedShapes[0]
  return {
    materialClass,
    shape,
    dims: dimsForShape(mat, shape),
    strength: { ...mat.defaults },
  }
}

export function parametricFieldsFromSection(s: Section): ParametricFields {
  // Caller guarantees s.mode === "parametric" with shape/materialClass present
  const mc = s.materialClass ?? "concrete"
  const sh = s.shape?.kind ?? materialDef(mc).allowedShapes[0]
  return {
    materialClass: mc,
    shape:         sh,
    dims:          { ...shapeDef(sh).defaults, ...(s.shape?.dims ?? {}) },
    strength:      { ...materialDef(mc).defaults, ...(s.strength ?? {}) },
  }
}

export function validateParametric(f: ParametricFields): ParametricValidation {
  const shapeRes    = shapeDef(f.shape).validate(f.dims)
  const materialRes = materialDef(f.materialClass).validate(f.strength)
  return {
    shapeError:    shapeRes.ok ? null : shapeRes.reason,
    materialError: materialRes.ok ? null : materialRes.reason,
    isValid:       shapeRes.ok && materialRes.ok,
  }
}

interface Props {
  fields: ParametricFields
  onChange: (next: ParametricFields) => void
  validation: ParametricValidation
  disabled?: boolean
}

export function ParametricForm({ fields, onChange, validation, disabled }: Props) {
  const mat = materialDef(fields.materialClass)
  const shape = shapeDef(fields.shape)

  const setMaterialClass = (mc: MaterialClass) => {
    const m = materialDef(mc)
    const sh = m.allowedShapes[0]
    onChange({
      materialClass: mc,
      shape: sh,
      dims: dimsForShape(m, sh),
      strength: { ...m.defaults },
    })
  }

  const setShape = (sh: SectionShape) => {
    onChange({ ...fields, shape: sh, dims: dimsForShape(mat, sh) })
  }

  const setDim = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = parseFloat(e.target.value)
    onChange({ ...fields, dims: { ...fields.dims, [key]: Number.isFinite(n) ? n : 0 } })
  }

  const setStrength = (key: "fc" | "fy" | "fu" | "E") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = parseFloat(e.target.value)
    onChange({ ...fields, strength: { ...fields.strength, [key]: Number.isFinite(n) ? n : 0 } })
  }

  return (
    <div className="space-y-3">
      {/* Material class */}
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-600">Material Class</Label>
        <Select value={fields.materialClass} onValueChange={(v) => setMaterialClass(v as MaterialClass)} disabled={disabled}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.values(MATERIALS)).map((m) => (
              <SelectItem key={m.kind} value={m.kind}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Shape selector with preview */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-gray-600">Geometry</Label>
          <Select value={fields.shape} onValueChange={(v) => setShape(v as SectionShape)} disabled={disabled}>
            <SelectTrigger
              className={cn(
                "h-6 text-xs px-1 py-0 border-0 shadow-none bg-transparent",
                "text-[#1a2f5e] font-medium gap-1 hover:bg-gray-100 rounded",
                "focus:ring-0 focus:ring-offset-0",
              )}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {mat.allowedShapes.map((k) => (
                <SelectItem key={k} value={k}>{SHAPES[k].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ShapePreview kind={fields.shape} dims={fields.dims} />
        {validation.shapeError && (
          <p className="text-[10px] text-red-500">{validation.shapeError}</p>
        )}
      </div>

      {/* Dimensions */}
      <div className="space-y-2">
        {shape.dimKeys.map((key) => (
          <div key={key} className="flex items-center gap-2">
            <Label className="text-xs text-gray-600 w-10">{key}</Label>
            <Input
              type="number"
              value={fields.dims[key] ?? 0}
              onChange={setDim(key)}
              disabled={disabled}
              className={cn(
                "h-7 text-xs font-mono flex-1",
                (!Number.isFinite(fields.dims[key]) || fields.dims[key] <= 0) &&
                  "border-red-400 focus-visible:ring-red-300",
              )}
            />
            <span className="text-xs text-gray-500 w-8">mm</span>
          </div>
        ))}
      </div>

      {/* Material strength */}
      <div className="space-y-1.5 pt-2 border-t border-gray-200">
        <Label className="text-xs font-semibold" style={{ color: "#1a2f5e" }}>Material</Label>
        {fields.materialClass === "concrete" && (
          <StrengthInput
            name="Compressive Strength" symbol="f'c"
            value={fields.strength.fc ?? 0}
            onChange={setStrength("fc")}
            unit="MPa"
            disabled={disabled}
          />
        )}
        {fields.materialClass === "steel" && (
          <>
            <StrengthInput name="Yield Strength"    symbol="fy" value={fields.strength.fy ?? 0} onChange={setStrength("fy")} unit="MPa" disabled={disabled} />
            <StrengthInput name="Ultimate Strength" symbol="fu" value={fields.strength.fu ?? 0} onChange={setStrength("fu")} unit="MPa" disabled={disabled} />
            <StrengthInput name="Elastic Modulus"   symbol="E"  value={fields.strength.E  ?? 0} onChange={setStrength("E")}  unit="MPa" disabled={disabled} />
          </>
        )}
        {validation.materialError && (
          <p className="text-[10px] text-red-500">{validation.materialError}</p>
        )}
      </div>
    </div>
  )
}

function StrengthInput({
  name, symbol, value, onChange, unit, disabled,
}: {
  name: string
  symbol: string
  value: number
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  unit: string
  disabled?: boolean
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600">
        {name}, <span className="font-medium text-[#1a2f5e]">{symbol}</span>
      </Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={cn(
            "h-7 text-xs font-mono flex-1 min-w-0",
            (!Number.isFinite(value) || value <= 0) && "border-red-400 focus-visible:ring-red-300",
          )}
        />
        <span className="text-xs text-gray-500 w-10 shrink-0 text-right">{unit}</span>
      </div>
    </div>
  )
}
