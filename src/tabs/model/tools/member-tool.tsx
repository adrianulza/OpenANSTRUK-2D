import type { Section, SectionId, MemberType } from "@/lib/model"
import { Label } from "@/components/ui/label"
import { SectionSelect, ToggleButton } from "@/components/flyout-shared"

export function MemberToolContent({
  activeSection,
  sections,
  onSectionChange,
  activeMemberType,
  onMemberTypeChange,
}: {
  activeSection: SectionId
  sections?: Record<string, Section>
  onSectionChange?: (id: SectionId) => void
  activeMemberType: MemberType
  onMemberTypeChange?: (t: MemberType) => void
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-600">Member Type</Label>
        <div className="flex gap-1">
          <ToggleButton
            active={activeMemberType === "frame"}
            onClick={() => onMemberTypeChange?.("frame")}
            className="h-7 text-[11px]"
          >
            Frame
          </ToggleButton>
          <ToggleButton
            active={activeMemberType === "truss"}
            onClick={() => onMemberTypeChange?.("truss")}
            className="h-7 text-[11px]"
          >
            Truss
          </ToggleButton>
        </div>
        <p className="text-[10px] text-gray-400 leading-snug">
          {activeMemberType === "frame"
            ? "Full beam-column: axial + shear + moment"
            : "Frame with moment releases at both ends. Transmits only axial at joints; carries transverse load locally (self-weight produces simply-supported bending)."}
        </p>
      </div>

      <SectionSelect value={activeSection} sections={sections} onChange={onSectionChange} />
      <p className="text-xs text-gray-500 leading-relaxed">
        Click two points on canvas to draw a member
      </p>
    </div>
  )
}
