import * as React from "react"
import { FLYOUT_PANEL_COLORS } from "@/lib/flyout-panel-colors"
import type { Section, SectionId, MultiSelection, SupportType } from "@/lib/model"
import { Label } from "@/components/ui/label"
import { pinIcon, rollerIcon, fixedIcon } from "@/components/ui/support-icons"
import { SectionSelect } from "@/components/flyout-shared"

export function ModifyComponentToolContent({
  selection,
  sectionId,
  sections,
  onSectionChange,
  onModify,
  onModifySupport,
}: {
  selection: MultiSelection
  sectionId: SectionId
  sections?: Record<string, Section>
  onSectionChange?: (id: SectionId) => void
  onModify?: () => void
  onModifySupport?: (type: SupportType) => void
}) {
  const hasMembers = selection.memberIds.length > 0
  const hasSupports = selection.supportNodeIds.length > 0

  const [sectionApplied, setSectionApplied] = React.useState(false)
  const [supportType, setSupportType] = React.useState<SupportType>("pin")
  const [supportApplied, setSupportApplied] = React.useState(false)

  const memberKey = selection.memberIds.join(",")
  React.useEffect(() => { setSectionApplied(false) }, [sectionId, memberKey])

  const supportKey = selection.supportNodeIds.join(",")
  React.useEffect(() => { setSupportApplied(false) }, [supportType, supportKey])

  const canApplySection = hasMembers && !sectionApplied
  const canApplySupport = hasSupports && !supportApplied

  const supportBtn = (type: SupportType, icon: React.ReactNode, title: string) => (
    <button
      key={type}
      onClick={() => { setSupportType(type); setSupportApplied(false) }}
      className="flex-1 h-10 flex flex-col items-center justify-center gap-0.5 rounded transition-colors text-[11px]"
      style={supportType === type ? {
        color: FLYOUT_PANEL_COLORS.primary,
        backgroundColor: FLYOUT_PANEL_COLORS.primary + '19',
        fontWeight: 500,
      } : {
        backgroundColor: '#f3f4f6',
        color: '#6b7280',
      }}
    >
      {icon}
      {title}
    </button>
  )

  const memberCount = selection.memberIds.length
  const supportCount = selection.supportNodeIds.length

  return (
    <div className="space-y-3">
      {memberCount > 0 && (
        <div className="px-2.5 py-1.5 rounded-md bg-gray-50 border border-gray-100 text-[12px] text-gray-600 truncate">
          {memberCount} member{memberCount > 1 ? "s" : ""} selected
        </div>
      )}

      {hasMembers && (
        <div className="space-y-2">
          <SectionSelect value={sectionId} sections={sections} onChange={onSectionChange} label="Modify section" />
          <button
            onClick={() => {
              if (!canApplySection) return
              onModify?.()
              setSectionApplied(true)
            }}
            disabled={!canApplySection}
            className="w-full py-1.5 rounded-md text-[13px] font-medium transition-colors"
            style={canApplySection ? {
              backgroundColor: FLYOUT_PANEL_COLORS.primary,
              color: 'white',
            } : {
              backgroundColor: '#f3f4f6',
              color: '#9ca3af',
              cursor: 'not-allowed',
            }}
          >
            Apply
          </button>
        </div>
      )}

      {supportCount > 0 && (
        <div className="px-2.5 py-1.5 rounded-md bg-gray-50 border border-gray-100 text-[12px] text-gray-600 truncate">
          {supportCount} support{supportCount > 1 ? "s" : ""} selected
        </div>
      )}

      {hasSupports && (
        <div className="space-y-2">
          <Label className="text-xs text-gray-600">Modify support</Label>
          <div className="flex gap-1.5">
            {supportBtn("pin", pinIcon, "Pin")}
            {supportBtn("roller", rollerIcon, "Roller")}
            {supportBtn("fixed", fixedIcon, "Fixed")}
          </div>
          <button
            onClick={() => {
              if (!canApplySupport) return
              onModifySupport?.(supportType)
              setSupportApplied(true)
            }}
            disabled={!canApplySupport}
            className="w-full py-1.5 rounded-md text-[13px] font-medium transition-colors"
            style={canApplySupport ? {
              backgroundColor: FLYOUT_PANEL_COLORS.primary,
              color: 'white',
            } : {
              backgroundColor: '#f3f4f6',
              color: '#9ca3af',
              cursor: 'not-allowed',
            }}
          >
            Apply
          </button>
        </div>
      )}

      {!hasMembers && !hasSupports && (
        <p className="text-xs text-gray-500">Select members or supports to modify</p>
      )}
    </div>
  )
}
