import { FLYOUT_PANEL_COLORS } from "@/lib/flyout-panel-colors"
import type { Section, SectionId, MemberType } from "@/lib/model"
import { Label } from "@/components/ui/label"
import { SectionSelect } from "@/components/flyout-shared"

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
          <button
            onClick={() => onMemberTypeChange?.("frame")}
            className="flex-1 h-7 text-[11px] rounded-md transition-colors"
            style={activeMemberType === "frame" ? {
              backgroundColor: FLYOUT_PANEL_COLORS.primary,
              color: 'white',
            } : {
              backgroundColor: '#f3f4f6',
              color: '#4b5563',
            }}
          >
            Frame
          </button>
          <button
            onClick={() => onMemberTypeChange?.("truss")}
            className="flex-1 h-7 text-[11px] rounded-md transition-colors"
            style={activeMemberType === "truss" ? {
              backgroundColor: FLYOUT_PANEL_COLORS.primary,
              color: 'white',
            } : {
              backgroundColor: '#f3f4f6',
              color: '#4b5563',
            }}
          >
            Truss
          </button>
        </div>
        <p className="text-[10px] text-gray-400 leading-snug">
          {activeMemberType === "frame"
            ? "Full beam-column: axial + shear + moment"
            : "Pure axial only: pin-released both ends"}
        </p>
      </div>

      <SectionSelect value={activeSection} sections={sections} onChange={onSectionChange} />
      <p className="text-xs text-gray-500 leading-relaxed">
        Click two points on canvas to draw a member
      </p>
    </div>
  )
}
