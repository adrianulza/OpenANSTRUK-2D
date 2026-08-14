/**
 * STEEL PREFERENCES — the code-level setup for structural steel, step 1 of the
 * Steel design tool. Global defaults; a section that carries its own fy
 * overrides Fy per member, so a model can mix grades.
 *
 * The code dropdown is a **labelling axis only**: SNI 1729:2020 adopts AISC
 * 360-16 and SNI 7860 adopts AISC 341-16, so no steel clause differs between the
 * two. This is unlike the RC side, where the editions genuinely diverge.
 */

import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { FRAME_TYPES, type FrameType } from "@/lib/design/core/types"
import { STEEL_CODE_LABELS, type SteelCode, type SteelCriteria } from "@/lib/design/steel/criteria"
import { CriteriaInput } from "../shared/criteria-input"

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

/** Short framing-type label for the context strip — the long form does not fit. */
export function steelFrameShortLabel(criteria: SteelCriteria): string {
  return criteria.code === "SNI1729-2020"
    ? { OMF: "RMB", IMF: "RMM", SMF: "RMK" }[criteria.frameType]
    : criteria.frameType
}

interface SteelPreferencesProps {
  criteria: SteelCriteria
  onChange: (patch: Partial<SteelCriteria>) => void
}

export function SteelPreferencesPane({ criteria, onChange }: SteelPreferencesProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-600">Design Code</Label>
        <Select
          value={criteria.code}
          onValueChange={(v) => onChange({ code: v as SteelCode })}
        >
          <SelectTrigger className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
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
          <SelectTrigger className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
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
