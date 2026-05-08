import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { ChevronDown, ChevronRight } from "lucide-react"
import type { TabType } from "./tool-sidebar"

interface NavBarProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  onTemplateLoad: (template: 1 | 2 | 3 | 4 | 5) => void
  onNewFile: () => void
  onOpenBeamTemplate: () => void
  onOpenFrameTemplate: () => void
  onOpenTrussTemplate: () => void
  onOpenExamplesModal: () => void
}

const tabs: TabType[] = ["Model", "Load", "Analyze"]

const EXAMPLE_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Simple Beam",
  2: "Cantilever",
  3: "Portal (Gravity)",
  4: "Portal (Lateral)",
  5: "Asymmetric Rafter",
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function NewCanvasIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="9" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" fill="white" />
      <path d="M8 1v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="3" y1="6" x2="8" y2="6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="1.5 1" />
      <line x1="3" y1="8.5" x2="7" y2="8.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="1.5 1" />
    </svg>
  )
}

function BeamIcon() {
  return (
    <svg width="34" height="16" viewBox="0 0 34 16" fill="none">
      <rect x="1" y="5" width="32" height="3" rx="0.5" fill="currentColor" />
      <polygon points="4,8 1,14 7,14" fill="currentColor" />
      <line x1="0" y1="14" x2="8" y2="14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <polygon points="30,8 27,13 33,13" fill="currentColor" />
      <circle cx="28.5" cy="15" r="1.2" fill="white" stroke="currentColor" strokeWidth="1" />
      <circle cx="31.5" cy="15" r="1.2" fill="white" stroke="currentColor" strokeWidth="1" />
      <line x1="26" y1="15" x2="34" y2="15" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function FrameIcon() {
  return (
    <svg width="24" height="18" viewBox="0 0 24 18" fill="none">
      <rect x="1" y="2" width="3" height="12" rx="0.5" fill="currentColor" />
      <rect x="20" y="2" width="3" height="12" rx="0.5" fill="currentColor" />
      <rect x="1" y="2" width="22" height="3" rx="0.5" fill="currentColor" />
      <line x1="0" y1="14" x2="6" y2="14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="1" y1="14" x2="0" y2="17" stroke="currentColor" strokeWidth="1" />
      <line x1="3" y1="14" x2="2" y2="17" stroke="currentColor" strokeWidth="1" />
      <line x1="5" y1="14" x2="4" y2="17" stroke="currentColor" strokeWidth="1" />
      <line x1="18" y1="14" x2="24" y2="14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="19" y1="14" x2="18" y2="17" stroke="currentColor" strokeWidth="1" />
      <line x1="21" y1="14" x2="20" y2="17" stroke="currentColor" strokeWidth="1" />
      <line x1="23" y1="14" x2="22" y2="17" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

function TrussIcon() {
  return (
    <svg width="36" height="16" viewBox="0 0 36 16" fill="none">
      <line x1="0" y1="2" x2="36" y2="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="0" y1="12" x2="36" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="0" y1="12" x2="9" y2="2" stroke="currentColor" strokeWidth="1.3" />
      <line x1="9" y1="2" x2="18" y2="12" stroke="currentColor" strokeWidth="1.3" />
      <line x1="18" y1="12" x2="27" y2="2" stroke="currentColor" strokeWidth="1.3" />
      <line x1="27" y1="2" x2="36" y2="12" stroke="currentColor" strokeWidth="1.3" />
      <line x1="0" y1="2" x2="0" y2="12" stroke="currentColor" strokeWidth="1.3" />
      <line x1="36" y1="2" x2="36" y2="12" stroke="currentColor" strokeWidth="1.3" />
      <polygon points="2,12 0,16 4,16" fill="currentColor" />
      <polygon points="34,12 32,16 36,16" fill="currentColor" />
      <circle cx="33" cy="15" r="1" fill="white" stroke="currentColor" strokeWidth="0.8" />
      <circle cx="35.2" cy="15" r="1" fill="white" stroke="currentColor" strokeWidth="0.8" />
    </svg>
  )
}

// ─── NavBar ───────────────────────────────────────────────────────────────────

export function NavBar({
  activeTab,
  onTabChange,
  onTemplateLoad,
  onNewFile,
  onOpenBeamTemplate,
  onOpenFrameTemplate,
  onOpenTrussTemplate,
  onOpenExamplesModal,
}: NavBarProps) {
  const [fileOpen, setFileOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  const openDropdown = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setDropdownPos({ top: r.bottom, left: r.left })
    }
    setFileOpen(true)
  }

  useEffect(() => {
    if (!fileOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      const dropdown = document.getElementById("file-dropdown-portal")
      if (btnRef.current?.contains(target) || dropdown?.contains(target)) return
      setFileOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [fileOpen])

  const close = () => setFileOpen(false)

  const dropdown = fileOpen
    ? createPortal(
        <div
          id="file-dropdown-portal"
          style={{ position: "fixed", top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
          className="w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1"
        >
          {/* New Canvas */}
          <button
            onClick={() => { onNewFile(); close() }}
            className="w-full flex items-center gap-3 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <span className="text-gray-500 shrink-0"><NewCanvasIcon /></span>
            <span className="font-medium">New Canvas</span>
          </button>

          {/* Templates section */}
          <div className="my-1 border-t border-gray-100" />
          <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Templates</p>
          {[
            { label: "Beam",  icon: <BeamIcon />,  action: onOpenBeamTemplate  },
            { label: "Frame", icon: <FrameIcon />, action: onOpenFrameTemplate },
            { label: "Truss", icon: <TrussIcon />, action: onOpenTrussTemplate },
          ].map(({ label, icon, action }) => (
            <button
              key={label}
              onClick={() => { action(); close() }}
              className="w-full flex items-center gap-3 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              <span className="text-gray-500 shrink-0">{icon}</span>
              <span className="font-medium">{label}</span>
            </button>
          ))}

          {/* Examples section */}
          <div className="my-1 border-t border-gray-100" />
          <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Examples</p>
          <button
            onClick={() => { onOpenExamplesModal(); close() }}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            Load Example...
          </button>
        </div>,
        document.body
      )
    : null

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="relative h-11 flex items-center px-4">

        {/* Logo — anchored left */}
        <h1 className="text-lg font-bold text-[#1a2f5e] tracking-tight shrink-0">
          OpenANSTRUK-2D
        </h1>

        {/* Tabs + File — absolute-centred as a group */}
        <nav className="absolute left-1/2 -translate-x-1/2 flex items-center">
          {/* File tab-style button */}
          <button
            ref={btnRef}
            onClick={fileOpen ? close : openDropdown}
            className={cn(
              "relative flex items-center gap-1 px-6 h-11 text-sm font-medium transition-colors",
              fileOpen ? "text-[#1a2f5e]" : "text-gray-500 hover:text-gray-700"
            )}
          >
            File
            <ChevronDown
              size={11}
              strokeWidth={2.5}
              className={cn("transition-transform", fileOpen && "rotate-180")}
            />
            {fileOpen && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1a2f5e]" />
            )}
          </button>

          {tabs.map((tab, i) => (
            <div key={tab} className="flex items-center">
              {i > 0 && (
                <ChevronRight
                  size={13}
                  strokeWidth={1.75}
                  className="text-gray-300 -mx-1 shrink-0"
                />
              )}
              <button
                onClick={() => onTabChange(tab)}
                className={cn(
                  "relative px-6 h-11 text-sm font-medium transition-colors",
                  activeTab === tab
                    ? "text-[#1a2f5e]"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {tab}
                {activeTab === tab && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1a2f5e]" />
                )}
              </button>
            </div>
          ))}
        </nav>
      </div>

      {dropdown}
    </header>
  )
}
