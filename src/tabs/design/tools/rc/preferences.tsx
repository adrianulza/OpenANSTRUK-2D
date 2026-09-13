/**
 * RC PREFERENCES — the code-level setup for reinforced concrete, step 1 of the
 * RC design tool (SAP2000 "Design Preferences" style). One column of labelled
 * fields; values apply to every concrete member in the model.
 *
 * Lives beside the RC section pane rather than in a shared criteria tool: the
 * settings here are meaningless without the material, and the material is the
 * tool you are already in.
 */

import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { FRAME_TYPES, type FrameType } from "@/lib/design/core/types"
import type { RcCriteria } from "@/lib/design/rc/criteria"
import { RC_CODE_LABELS, type RcCode } from "@/lib/design/rc/codes"
import { CriteriaInput } from "../shared/criteria-input"

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

/** Short framing-type label for the context strip — the long form does not fit. */
export function rcFrameShortLabel(criteria: RcCriteria): string {
  return criteria.code === "SNI2847-19"
    ? { OMF: "SRPMB", IMF: "SRPMM", SMF: "SRPMK" }[criteria.frameType]
    : criteria.frameType
}

interface RcPreferencesProps {
  criteria: RcCriteria
  onChange: (patch: Partial<RcCriteria>) => void
}

export function RcPreferencesPane({ criteria, onChange }: RcPreferencesProps) {
  return (
    <div className="space-y-3">
      {/* Design code */}
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-600">Design Code</Label>
        <Select
          value={criteria.code}
          onValueChange={(v) => onChange({ code: v as RcCode })}
        >
          <SelectTrigger className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
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
          <SelectTrigger className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
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
    </div>
  )
}
