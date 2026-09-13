/**
 * The Design tab's two-step pane switch.
 *
 * Every design tool (RC, Steel) holds the same two panes, in the same order:
 * PREFERENCES sets the code-level rules for that material, SECTION applies them
 * to a specific section. The switch renders them as a numbered sequence rather
 * than a plain toggle, because the order is real — the preferences decide which
 * clauses the section pane then checks against.
 *
 * The icons are inherited: the sliders glyph was the old DESIGN CRITERIA tool's
 * sidebar icon, and the section glyphs were the RC / Steel tool icons. Carrying
 * them here keeps the merged tools recognisable to anyone who knew the old
 * four-tool layout.
 */

import * as React from "react"
import { ChevronRight, SlidersHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"

export type DesignPane = "preferences" | "section"

interface PaneSwitchProps {
  pane: DesignPane
  onPaneChange: (p: DesignPane) => void
  /** Section-pane glyph — the RC or Steel section icon of the owning tool. */
  sectionIcon: React.ReactNode
  /** Section-pane label. "SECTION" for RC, "SECTION" for steel; kept a prop so
   *  a future material can name its second step differently. */
  sectionLabel?: string
}

export function PaneSwitch({
  pane, onPaneChange, sectionIcon, sectionLabel = "SECTION",
}: PaneSwitchProps) {
  return (
    <div className="flex items-stretch gap-1" role="tablist">
      <PaneChip
        step={1}
        active={pane === "preferences"}
        onClick={() => onPaneChange("preferences")}
        icon={<SlidersHorizontal size={13} />}
        title="Code-level rules for this material — standard, framing type, material strengths, φ factors"
      >
        PREFERENCES
      </PaneChip>

      <ChevronRight
        size={13}
        className="self-center shrink-0 text-gray-300"
        aria-hidden
      />

      <PaneChip
        step={2}
        active={pane === "section"}
        onClick={() => onPaneChange("section")}
        icon={sectionIcon}
        title="Apply those rules to a section — geometry, reinforcement or member data, and the resulting checks"
      >
        {sectionLabel}
      </PaneChip>
    </div>
  )
}

function PaneChip({
  step, active, onClick, icon, title, children,
}: {
  step: number
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      title={title}
      className={cn(
        "flex-1 min-w-0 h-9 px-1.5 rounded flex items-center justify-center gap-1.5",
        "transition-colors",
        active
          ? "border-2 border-[#2563eb] bg-[#2563eb]/5 text-[#2563eb]"
          : "border border-gray-200 text-gray-400 hover:border-[#2563eb] hover:text-[#2563eb] hover:bg-[#2563eb]/5",
      )}
    >
      <span
        className={cn(
          "shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center",
          "text-[8px] font-bold leading-none",
          active ? "bg-[#2563eb] text-white" : "bg-gray-200 text-gray-500",
        )}
        aria-hidden
      >
        {step}
      </span>
      <span className="shrink-0" aria-hidden>{icon}</span>
      <span className="text-[10px] font-semibold tracking-wide truncate">{children}</span>
    </button>
  )
}
