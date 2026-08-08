import * as React from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { FRAME_TYPES, type DesignMaterial, type FrameType } from "@/lib/design/core/types"
import type { DesignCriteria } from "@/lib/design/core/criteria"
import type { RcCriteria } from "@/lib/design/rc/criteria"
import { STEEL_CODE_LABELS, type SteelCode, type SteelCriteria } from "@/lib/design/steel/criteria"
import { RC_CODE_LABELS, type RcCode } from "@/lib/design/rc/codes"

/**
 * Framing-type labels per code: SNI 2847:2019 uses SRPMB/SRPMM/SRPMK, ACI 318-25
 * uses OMF/IMF/SMF (the engine `frameType` enum stays OMF|IMF|SMF internally).
 */
const FRAME_TYPE_LABELS_ACI: Record<FrameType, string> = {
  OMF: "Ordinary Moment Frame (OMF)",
  IMF: "Intermediate Moment Frame (IMF)",
  SMF: "Special Moment Frame (SMF)",
}
const FRAME_TYPE_LABELS_SNI: Record<FrameType, string> = {
  OMF: "SRPMB (Biasa)",
  IMF: "SRPMM (Menengah)",
  SMF: "SRPMK (Khusus)",
}
function frameTypeLabels(code: RcCode): Record<FrameType, string> {
  return code === "SNI2847-19" ? FRAME_TYPE_LABELS_SNI : FRAME_TYPE_LABELS_ACI
}

interface DesignCriteriaToolProps {
  criteria: DesignCriteria
  onChange: (patch: Partial<DesignCriteria>) => void
}

interface RcCriteriaFieldsProps {
  criteria: RcCriteria
  onChange: (patch: Partial<RcCriteria>) => void
}

interface SteelCriteriaFieldsProps {
  criteria: SteelCriteria
  onChange: (patch: Partial<SteelCriteria>) => void
}

/**
 * Framing-type labels per steel code. SNI 7860 uses RMK/RMM/RMB, AISC 341-16
 * uses SMF/IMF/OMF; the engine `frameType` enum stays OMF|IMF|SMF internally,
 * exactly as on the RC side.
 */
const STEEL_FRAME_LABELS_AISC: Record<FrameType, string> = {
  OMF: "Ordinary Moment Frame (OMF)",
  IMF: "Intermediate Moment Frame (IMF)",
  SMF: "Special Moment Frame (SMF)",
}
const STEEL_FRAME_LABELS_SNI: Record<FrameType, string> = {
  OMF: "RMB (Biasa)",
  IMF: "RMM (Menengah)",
  SMF: "RMK (Khusus)",
}
function steelFrameLabels(code: SteelCode): Record<FrameType, string> {
  return code === "SNI1729-2020" ? STEEL_FRAME_LABELS_SNI : STEEL_FRAME_LABELS_AISC
}

/**
 * STEEL criteria. Global defaults — a section that carries its own fy overrides
 * Fy per member, so a model can mix grades.
 *
 * The code dropdown is a **labelling axis only**: SNI 1729:2020 adopts AISC
 * 360-16 and SNI 7860 adopts AISC 341-16, so no steel clause differs between the
 * two. This is unlike the RC side, where the editions genuinely diverge.
 */
function SteelCriteriaFields({ criteria, onChange }: SteelCriteriaFieldsProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-600">Design Code</Label>
        <Select
          value={criteria.code}
          onValueChange={(v) => onChange({ code: v as SteelCode })}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(STEEL_CODE_LABELS) as SteelCode[]).map((c) => (
              <SelectItem key={c} value={c}>{STEEL_CODE_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-gray-600">Framing Type</Label>
        <Select
          value={criteria.frameType}
          onValueChange={(v) => onChange({ frameType: v as FrameType })}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FRAME_TYPES.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {steelFrameLabels(criteria.code)[f.id]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-gray-500 leading-snug">
          {criteria.frameType === "OMF"
            ? "No seismic ductility requirement — members are governed by AISC 360 alone."
            : criteria.frameType === "SMF"
              ? "Highly ductile sections (Table D1.1), beam bracing (D1.2), and strong-column-weak-beam at every joint (E3.4a)."
              : "Moderately ductile sections (Table D1.1) and beam bracing (D1.2). No moment-ratio requirement."}
        </p>
        {criteria.frameType !== "OMF" && (
          <p className="text-[9px] text-amber-700 leading-snug">
            ⚠ Table D1.1 limits are transcribed from working knowledge, not from
            the standard text — verify before relying on them. Moment frames
            only; braced-frame systems are not modelled.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold" style={{ color: "#1a2f5e" }}>Material</Label>
        <CriteriaInput label="Yield stress" symbol="Fy" value={criteria.Fy} unit="MPa" min={1} onCommit={(v) => onChange({ Fy: v })} />
        <CriteriaInput label="Tensile strength" symbol="Fu" value={criteria.Fu} unit="MPa" min={1} onCommit={(v) => onChange({ Fu: v })} />
        <CriteriaInput label="Elastic modulus" symbol="E" value={criteria.E} unit="MPa" min={1} onCommit={(v) => onChange({ E: v })} />
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold" style={{ color: "#1a2f5e" }}>Strength Reduction</Label>
        <CriteriaInput label="Flexure (F1)" symbol="φb" value={criteria.phiB} unit="" min={0.01} max={1} onCommit={(v) => onChange({ phiB: v })} />
        <CriteriaInput label="Shear (G1)" symbol="φv" value={criteria.phiV} unit="" min={0.01} max={1} onCommit={(v) => onChange({ phiV: v })} />
        <CriteriaInput label="Compression (E1)" symbol="φc" value={criteria.phiC} unit="" min={0.01} max={1} onCommit={(v) => onChange({ phiC: v })} />
      </div>

      <div className="rounded bg-gray-50 border border-gray-200 px-2 py-2">
        <p className="text-[10px] text-gray-600 leading-snug font-medium">Assumptions</p>
        <ul className="mt-1 space-y-0.5 text-[9px] text-gray-500 leading-snug">
          <li>
            <strong>Braced frames only.</strong> K<sub>33</sub> = K<sub>22</sub> = 1.0.
            Sway stability (P-Δ, notional loads) is not analysed.
          </li>
          <li>
            <strong>Members are laterally unbraced</strong> over their full length
            (L<sub>b</sub> = L). Subdivide a member to model bracing.
          </li>
          <li>
            C<sub>b</sub> is computed per combination from the moment diagram (F1-1).
          </li>
          <li>
            Combined forces use H1.1 / H2 only — the H1.3 alternative is not
            applied, which is conservative.
          </li>
        </ul>
      </div>
    </div>
  )
}

/**
 * DESIGN CRITERIA — global code-check setup (SAP2000 "Design Preferences"
 * style). One column of labelled fields; values apply to every designed member.
 */
export function DesignCriteriaToolContent({ criteria, onChange }: DesignCriteriaToolProps) {
  return (
    <div className="space-y-3">
      {/* Material family — left RC / right Steel */}
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-600">Design Material</Label>
        <div className="grid grid-cols-2 gap-1">
          <MaterialButton
            active={criteria.material === "rc"}
            onClick={() => onChange({ material: "rc" as DesignMaterial })}
            title="Reinforced concrete design (ACI 318-14 / SNI 2847:2019)"
          >
            Reinforced Concrete
          </MaterialButton>
          <MaterialButton
            active={criteria.material === "steel"}
            onClick={() => onChange({ material: "steel" as DesignMaterial })}
            title="Structural steel design (AISC 360-16 / SNI 1729:2020)"
          >
            Steel
          </MaterialButton>
        </div>
      </div>

      {criteria.material === "steel" ? (
        <SteelCriteriaFields
          criteria={criteria.steel}
          onChange={(p) => onChange({ steel: { ...criteria.steel, ...p } })}
        />
      ) : (
        <RcCriteriaFields
          criteria={criteria.rc}
          onChange={(p) => onChange({ rc: { ...criteria.rc, ...p } })}
        />
      )}
    </div>
  )
}

function MaterialButton({
  active, onClick, title, children,
}: {
  active: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "h-8 rounded text-xs font-medium transition-colors px-1",
        active
          ? "border-2 border-[#2563eb] bg-[#2563eb]/5 text-[#2563eb]"
          : "border border-gray-200 text-gray-400 hover:border-[#2563eb] hover:text-[#2563eb] hover:bg-[#2563eb]/5",
      )}
    >
      {children}
    </button>
  )
}

/** RC-specific criteria fields (code, frame type, rebar material, φ, params). */
function RcCriteriaFields({ criteria, onChange }: RcCriteriaFieldsProps) {
  return (
    <>
      {/* Design code */}
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-600">Design Code</Label>
        <Select
          value={criteria.code}
          onValueChange={(v) => onChange({ code: v as RcCode })}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(RC_CODE_LABELS) as RcCode[]).map((c) => (
              <SelectItem key={c} value={c}>{RC_CODE_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-gray-500 leading-snug">
          {criteria.code === "ACI318-25"
            ? "ACI 318-25: tension-controlled limit εty+0.003 and one-way-shear size effect λs (members without min. stirrups). Differs from SNI only for high-strength steel / deep unstirruped regions."
            : "SNI 2847:2019 (adopted from ACI 318-14): fixed tension-controlled limit 0.005, no shear size effect (λs = 1)."}
        </p>
      </div>

      {/* Frame type */}
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-600">Framing Type</Label>
        <Select
          value={criteria.frameType}
          onValueChange={(v) => onChange({ frameType: v as FrameType })}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FRAME_TYPES.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {frameTypeLabels(criteria.code)[f.id]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {criteria.frameType !== "OMF" && (
          <p className="text-[10px] text-gray-500 leading-snug">
            {criteria.frameType === "SMF"
              ? "SMF/SRPMK: shear from Mpr (1.25fy), Vc = 0 in hinge zones, hoop spacing limits. Columns add Ash confinement (18.7.5) and strong-column-weak-beam (18.7.3.2)."
              : "IMF/SRPMM: shear from nominal end moments Mn plus gravity; columns get lighter tie spacing over lo (18.4.3)."}
          </p>
        )}
      </div>

      {/* Reinforcement material */}
      <div className="space-y-1.5 pt-2 border-t border-gray-200">
        <Label className="text-xs font-semibold" style={{ color: "#1a2f5e" }}>Rebar Material</Label>
        <CriteriaInput label="Main bar yield" symbol="fy" value={criteria.fy} unit="MPa" min={1} onCommit={(v) => onChange({ fy: v })} />
        <CriteriaInput label="Stirrup yield" symbol="fyt" value={criteria.fyt} unit="MPa" min={1} onCommit={(v) => onChange({ fyt: v })} />
        <CriteriaInput label="Elastic modulus" symbol="Es" value={criteria.Es} unit="MPa" min={1} onCommit={(v) => onChange({ Es: v })} />
      </div>

      {/* Strength reduction factors */}
      <div className="space-y-1.5 pt-2 border-t border-gray-200">
        <Label className="text-xs font-semibold" style={{ color: "#1a2f5e" }}>Strength Reduction</Label>
        <CriteriaInput label="Flexure (tension-ctrl.)" symbol="φt" value={criteria.phiTension} unit="" min={0.01} max={1} onCommit={(v) => onChange({ phiTension: v })} />
        <CriteriaInput label="Shear" symbol="φv" value={criteria.phiShear} unit="" min={0.01} max={1} onCommit={(v) => onChange({ phiShear: v })} />
        <CriteriaInput label="Compression-ctrl." symbol="φc" value={criteria.phiCompression} unit="" min={0.01} max={1} onCommit={(v) => onChange({ phiCompression: v })} />
      </div>

      {/* Other parameters */}
      <div className="space-y-1.5 pt-2 border-t border-gray-200">
        <Label className="text-xs font-semibold" style={{ color: "#1a2f5e" }}>Parameters</Label>
        <CriteriaInput label="Lightweight factor" symbol="λ" value={criteria.lambda} unit="" min={0.01} max={1} onCommit={(v) => onChange({ lambda: v })} />
        <CriteriaInput label="Stirrup legs" symbol="n" value={criteria.stirrupLegs} unit="" min={1} integer onCommit={(v) => onChange({ stirrupLegs: v })} />
      </div>
    </>
  )
}

function CriteriaInput({
  label, symbol, value, unit, min, max, integer, onCommit,
}: {
  label: string
  symbol: string
  value: number
  unit: string
  min?: number
  max?: number
  integer?: boolean
  onCommit: (v: number) => void
}) {
  const [text, setText] = React.useState(String(value))
  React.useEffect(() => setText(String(value)), [value])

  const commit = () => {
    let n = parseFloat(text)
    if (!Number.isFinite(n)) {
      setText(String(value))
      return
    }
    if (integer) n = Math.round(n)
    if (min !== undefined) n = Math.max(min, n)
    if (max !== undefined) n = Math.min(max, n)
    setText(String(n))
    if (n !== value) onCommit(n)
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600">
        {label}, <span className="font-medium text-[#1a2f5e]">{symbol}</span>
      </Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className={cn(
            "h-7 text-xs font-mono flex-1 min-w-0",
            !Number.isFinite(parseFloat(text)) && "border-red-400 focus-visible:ring-red-300",
          )}
        />
        <span className="text-xs text-gray-500 w-8 shrink-0 text-right">{unit}</span>
      </div>
    </div>
  )
}
