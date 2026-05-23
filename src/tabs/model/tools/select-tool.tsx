import * as React from "react"
import type { Section, SectionId, MultiSelection, SupportType } from "@/lib/model"
import { Label } from "@/components/ui/label"
import { pinIcon, rollerIcon, fixedIcon } from "@/components/ui/support-icons"
import {
  SectionSelect,
  ToggleButton,
  ApplyButton,
  SelectionChip,
} from "@/components/flyout-shared"

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
    <ToggleButton
      key={type}
      active={supportType === type}
      onClick={() => { setSupportType(type); setSupportApplied(false) }}
      className="h-12 flex flex-col items-center justify-center gap-0.5 text-[11px]"
    >
      {icon}
      {title}
    </ToggleButton>
  )

  const memberCount = selection.memberIds.length
  const supportCount = selection.supportNodeIds.length

  return (
    <div className="space-y-3">
      {memberCount > 0 && (
        <SelectionChip>
          {memberCount} member{memberCount > 1 ? "s" : ""} selected
        </SelectionChip>
      )}

      {hasMembers && (
        <div className="space-y-2">
          <SectionSelect value={sectionId} sections={sections} onChange={onSectionChange} label="Modify section" />
          <ApplyButton
            disabled={!canApplySection}
            onClick={() => {
              if (!canApplySection) return
              onModify?.()
              setSectionApplied(true)
            }}
          >
            Apply
          </ApplyButton>
        </div>
      )}

      {supportCount > 0 && (
        <SelectionChip>
          {supportCount} support{supportCount > 1 ? "s" : ""} selected
        </SelectionChip>
      )}

      {hasSupports && (
        <div className="space-y-2">
          <Label className="text-xs text-gray-600">Modify support</Label>
          <div className="flex gap-1.5">
            {supportBtn("pin", pinIcon, "Pin")}
            {supportBtn("roller", rollerIcon, "Roller")}
            {supportBtn("fixed", fixedIcon, "Fixed")}
          </div>
          <ApplyButton
            disabled={!canApplySupport}
            onClick={() => {
              if (!canApplySupport) return
              onModifySupport?.(supportType)
              setSupportApplied(true)
            }}
          >
            Apply
          </ApplyButton>
        </div>
      )}

      {!hasMembers && !hasSupports && (
        <p className="text-xs text-gray-500">Select members or supports to modify</p>
      )}
    </div>
  )
}
