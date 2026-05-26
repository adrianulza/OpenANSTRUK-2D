import { useState } from "react"
import { Minus, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import type { StructureModel } from "@/lib/model"
import { newNodeId, newMemberId, defaultSections, resetIdCounter } from "@/lib/model"
import { ToggleButton } from "@/components/flyout-shared"

type FrameType =
  | "portal"
  | "diagonal-left"
  | "diagonal-right"
  | "x"
  | "v"
  | "inverted-v"

interface Props {
  onConfirm: (model: StructureModel) => void
  onClose: () => void
}

// ─── model builder ────────────────────────────────────────────────────────────

function buildFrameModel(
  numStories: number,
  numBays: number,
  storyHeight: number,
  bayWidth: number,
  section: string,
  supportType: "fixed" | "pin",
  frameType: FrameType
): StructureModel {
  resetIdCounter()
  const startX = -(numBays * bayWidth) / 2
  const startY = -(numStories * storyHeight) / 2

  // Primary grid: column intersection nodes
  const grid: string[][] = Array.from({ length: numStories + 1 }, () =>
    new Array(numBays + 1).fill("")
  )
  const nodes: StructureModel["nodes"] = {}

  for (let row = 0; row <= numStories; row++) {
    for (let col = 0; col <= numBays; col++) {
      const id = newNodeId()
      grid[row][col] = id
      nodes[id] = { id, x: startX + col * bayWidth, y: startY + row * storyHeight }
    }
  }

  const members: StructureModel["members"] = {}

  // Columns — identical for all frame types
  for (let col = 0; col <= numBays; col++) {
    for (let row = 0; row < numStories; row++) {
      const id = newMemberId()
      members[id] = { id, a: grid[row][col], b: grid[row + 1][col], section }
    }
  }

  if (frameType === "v") {
    // V brace: apex mid-node sits on the UPPER beam of each story.
    // Braces rise from both lower column nodes to the apex.
    // The upper beam is split left-half + right-half through the apex node.
    for (let story = 0; story < numStories; story++) {
      const upper = story + 1
      for (let bay = 0; bay < numBays; bay++) {
        const midId = newNodeId()
        nodes[midId] = {
          id: midId,
          x: startX + (bay + 0.5) * bayWidth,
          y: startY + upper * storyHeight,
        }
        // Split upper beam through apex
        const mL = newMemberId(), mR = newMemberId()
        members[mL] = { id: mL, a: grid[upper][bay], b: midId, section }
        members[mR] = { id: mR, a: midId, b: grid[upper][bay + 1], section }
        // Brace members from lower corners to apex
        const bL = newMemberId(), bR = newMemberId()
        members[bL] = { id: bL, a: grid[story][bay], b: midId, section }
        members[bR] = { id: bR, a: grid[story][bay + 1], b: midId, section }
      }
    }
  } else if (frameType === "inverted-v") {
    // Inverted-V: apex mid-node sits on the LOWER boundary of each story.
    // For the base story the "lower beam" is a grade beam added at ground level.
    // Braces descend from both upper column nodes to the apex.
    // The lower beam (or grade beam) is split through the apex node.
    for (let story = 0; story < numStories; story++) {
      const lower = story
      const upper = story + 1
      for (let bay = 0; bay < numBays; bay++) {
        const midId = newNodeId()
        nodes[midId] = {
          id: midId,
          x: startX + (bay + 0.5) * bayWidth,
          y: startY + lower * storyHeight,
        }
        // Split lower beam (ground beam for story=0, floor beam for story>0)
        const mL = newMemberId(), mR = newMemberId()
        members[mL] = { id: mL, a: grid[lower][bay], b: midId, section }
        members[mR] = { id: mR, a: midId, b: grid[lower][bay + 1], section }
        // Brace members from upper corners to apex
        const bL = newMemberId(), bR = newMemberId()
        members[bL] = { id: bL, a: grid[upper][bay], b: midId, section }
        members[bR] = { id: bR, a: grid[upper][bay + 1], b: midId, section }
      }
    }
    // Roof beam (top level is never a "lower boundary" — add it as a full beam)
    for (let col = 0; col < numBays; col++) {
      const id = newMemberId()
      members[id] = { id, a: grid[numStories][col], b: grid[numStories][col + 1], section }
    }
  } else {
    // Portal, diagonal-left, diagonal-right, x
    // Standard full beams at every floor level
    for (let row = 1; row <= numStories; row++) {
      for (let col = 0; col < numBays; col++) {
        const id = newMemberId()
        members[id] = { id, a: grid[row][col], b: grid[row][col + 1], section }
      }
    }
    // Diagonal braces
    for (let row = 0; row < numStories; row++) {
      for (let col = 0; col < numBays; col++) {
        if (frameType === "diagonal-right" || frameType === "x") {
          const id = newMemberId()
          members[id] = { id, a: grid[row][col], b: grid[row + 1][col + 1], section }
        }
        if (frameType === "diagonal-left" || frameType === "x") {
          const id = newMemberId()
          members[id] = { id, a: grid[row][col + 1], b: grid[row + 1][col], section }
        }
      }
    }
  }

  const supports: StructureModel["supports"] = {}
  for (let col = 0; col <= numBays; col++) {
    const nodeId = grid[0][col]
    supports[nodeId] = { nodeId, type: supportType }
  }

  return { nodes, members, supports, sections: { ...defaultSections }, loads: {} }
}

// ─── SVG constants ────────────────────────────────────────────────────────────

const NAVY = "#1a2f5e"
const SVG_W = 232
const SVG_H = 180
const PAD_X = 22
const PAD_TOP = 12
const SUPPORT_ZONE = 28
const BEAM_AREA_H = SVG_H - PAD_TOP - SUPPORT_ZONE   // 140 px

// ─── Support symbols ──────────────────────────────────────────────────────────

function PinSVG({ x, y, hw, th }: { x: number; y: number; hw: number; th: number }) {
  const baseY = y + th
  const gY = baseY + 3
  const n = Math.max(3, Math.min(5, Math.round((hw * 2) / 5)))
  return (
    <g>
      <polygon points={`${x},${y} ${x - hw},${baseY} ${x + hw},${baseY}`} fill={NAVY} />
      <line x1={x - hw - 2} y1={gY} x2={x + hw + 2} y2={gY} stroke={NAVY} strokeWidth={1.5} />
      {Array.from({ length: n }, (_, k) => {
        const hx = x - hw + (k / (n - 1)) * hw * 2
        return <line key={k} x1={hx} y1={gY} x2={hx - 4} y2={gY + 5} stroke={NAVY} strokeWidth={1} />
      })}
    </g>
  )
}

function FixedSVG({ x, y, hw }: { x: number; y: number; hw: number }) {
  const rh = Math.max(5, hw * 0.5)
  const gY = y + rh + 2
  const n = Math.max(3, Math.min(5, Math.round((hw * 2) / 5)))
  return (
    <g>
      <rect x={x - hw} y={y} width={hw * 2} height={rh} fill={NAVY} />
      <line x1={x - hw - 2} y1={gY} x2={x + hw + 2} y2={gY} stroke={NAVY} strokeWidth={1.5} />
      {Array.from({ length: n }, (_, k) => {
        const hx = x - hw + (k / (n - 1)) * hw * 2
        return <line key={k} x1={hx} y1={gY} x2={hx - 4} y2={gY + 5} stroke={NAVY} strokeWidth={1} />
      })}
    </g>
  )
}

// ─── Unified frame SVG preview ────────────────────────────────────────────────

function FramePreview({
  numStories,
  numBays,
  supportType,
  frameType,
}: {
  numStories: number
  numBays: number
  supportType: "fixed" | "pin"
  frameType: FrameType
}) {
  const cellW = (SVG_W - PAD_X * 2) / numBays
  const cellH = BEAM_AREA_H / numStories
  const groundY = PAD_TOP + BEAM_AREA_H

  const nodeR = Math.max(2, Math.min(3.5, cellW * 0.08, cellH * 0.1))
  const hw = Math.max(6, Math.min(13, cellW * 0.28))
  const th = Math.min(13, SUPPORT_ZONE * 0.46)
  const sw = Math.max(1, Math.min(2, cellW * 0.045))

  const sx = (col: number) => PAD_X + col * cellW
  const sy = (row: number) => groundY - row * cellH
  const mx = (col: number) => sx(col) + cellW / 2   // bay midpoint x

  const isV = frameType === "v"
  const isIV = frameType === "inverted-v"

  // ── beams ─────────────────────────────────────────────────────────────────
  const beams: React.ReactNode[] = []

  for (let row = 1; row <= numStories; row++) {
    for (let col = 0; col < numBays; col++) {
      if (isV) {
        // every floor beam is split (V-apex sits on the upper beam of each story)
        beams.push(
          <line key={`bvL-${row}-${col}`} x1={sx(col)} y1={sy(row)} x2={mx(col)} y2={sy(row)} stroke={NAVY} strokeWidth={sw} />,
          <line key={`bvR-${row}-${col}`} x1={mx(col)} y1={sy(row)} x2={sx(col + 1)} y2={sy(row)} stroke={NAVY} strokeWidth={sw} />
        )
      } else if (isIV && row < numStories) {
        // intermediate floor beams are split (inverted-V apex sits on the lower boundary)
        beams.push(
          <line key={`bivL-${row}-${col}`} x1={sx(col)} y1={sy(row)} x2={mx(col)} y2={sy(row)} stroke={NAVY} strokeWidth={sw} />,
          <line key={`bivR-${row}-${col}`} x1={mx(col)} y1={sy(row)} x2={sx(col + 1)} y2={sy(row)} stroke={NAVY} strokeWidth={sw} />
        )
      } else {
        beams.push(
          <line key={`b-${row}-${col}`} x1={sx(col)} y1={sy(row)} x2={sx(col + 1)} y2={sy(row)} stroke={NAVY} strokeWidth={sw} />
        )
      }
    }
  }

  // grade beam at ground for inverted-V
  if (isIV) {
    for (let col = 0; col < numBays; col++) {
      beams.push(
        <line key={`gbL-${col}`} x1={sx(col)} y1={sy(0)} x2={mx(col)} y2={sy(0)} stroke={NAVY} strokeWidth={sw} />,
        <line key={`gbR-${col}`} x1={mx(col)} y1={sy(0)} x2={sx(col + 1)} y2={sy(0)} stroke={NAVY} strokeWidth={sw} />
      )
    }
  }

  // ── braces ────────────────────────────────────────────────────────────────
  const braces: React.ReactNode[] = []

  for (let story = 0; story < numStories; story++) {
    for (let col = 0; col < numBays; col++) {
      if (frameType === "diagonal-right" || frameType === "x") {
        braces.push(<line key={`dr-${story}-${col}`} x1={sx(col)} y1={sy(story)} x2={sx(col + 1)} y2={sy(story + 1)} stroke={NAVY} strokeWidth={sw} strokeDasharray="3 2" />)
      }
      if (frameType === "diagonal-left" || frameType === "x") {
        braces.push(<line key={`dl-${story}-${col}`} x1={sx(col + 1)} y1={sy(story)} x2={sx(col)} y2={sy(story + 1)} stroke={NAVY} strokeWidth={sw} strokeDasharray="3 2" />)
      }
      if (isV) {
        const apexX = mx(col), apexY = sy(story + 1)
        braces.push(
          <line key={`vL-${story}-${col}`} x1={sx(col)} y1={sy(story)} x2={apexX} y2={apexY} stroke={NAVY} strokeWidth={sw} strokeDasharray="3 2" />,
          <line key={`vR-${story}-${col}`} x1={sx(col + 1)} y1={sy(story)} x2={apexX} y2={apexY} stroke={NAVY} strokeWidth={sw} strokeDasharray="3 2" />
        )
      }
      if (isIV) {
        const apexX = mx(col), apexY = sy(story)
        braces.push(
          <line key={`ivL-${story}-${col}`} x1={sx(col)} y1={sy(story + 1)} x2={apexX} y2={apexY} stroke={NAVY} strokeWidth={sw} strokeDasharray="3 2" />,
          <line key={`ivR-${story}-${col}`} x1={sx(col + 1)} y1={sy(story + 1)} x2={apexX} y2={apexY} stroke={NAVY} strokeWidth={sw} strokeDasharray="3 2" />
        )
      }
    }
  }

  // ── columns ───────────────────────────────────────────────────────────────
  const columns: React.ReactNode[] = []
  for (let col = 0; col <= numBays; col++) {
    for (let row = 0; row < numStories; row++) {
      columns.push(<line key={`c-${col}-${row}`} x1={sx(col)} y1={sy(row)} x2={sx(col)} y2={sy(row + 1)} stroke={NAVY} strokeWidth={sw + 0.5} />)
    }
  }

  // ── mid-nodes (apex circles) ───────────────────────────────────────────────
  const midNodes: React.ReactNode[] = []
  if (isV) {
    for (let story = 0; story < numStories; story++) {
      for (let col = 0; col < numBays; col++) {
        midNodes.push(<circle key={`mv-${story}-${col}`} cx={mx(col)} cy={sy(story + 1)} r={nodeR} fill="white" stroke={NAVY} strokeWidth={1} />)
      }
    }
  }
  if (isIV) {
    for (let story = 0; story < numStories; story++) {
      for (let col = 0; col < numBays; col++) {
        midNodes.push(<circle key={`miv-${story}-${col}`} cx={mx(col)} cy={sy(story)} r={nodeR} fill="white" stroke={NAVY} strokeWidth={1} />)
      }
    }
  }

  // ── grid nodes (column intersections except ground) ───────────────────────
  const gridNodes: React.ReactNode[] = []
  for (let row = 1; row <= numStories; row++) {
    for (let col = 0; col <= numBays; col++) {
      gridNodes.push(<circle key={`gn-${row}-${col}`} cx={sx(col)} cy={sy(row)} r={nodeR} fill="white" stroke={NAVY} strokeWidth={1} />)
    }
  }

  return (
    <svg width={SVG_W} height={SVG_H} className="select-none">
      {beams}
      {braces}
      {columns}
      {midNodes}
      {gridNodes}
      {Array.from({ length: numBays + 1 }, (_, col) =>
        supportType === "fixed"
          ? <FixedSVG key={col} x={sx(col)} y={groundY} hw={hw} />
          : <PinSVG key={col} x={sx(col)} y={groundY} hw={hw} th={th} />
      )}
    </svg>
  )
}

// ─── Shared stepper ───────────────────────────────────────────────────────────

function Stepper({ label, value, min, max, hint, onChange }: {
  label: string; value: number; min: number; max: number; hint?: string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <span className="block text-xs font-medium text-gray-500 mb-1.5">{label}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:border-[#2563eb] hover:text-[#2563eb] hover:bg-[#2563eb]/5 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:text-gray-500 disabled:hover:bg-transparent transition-colors"
        >
          <Minus size={11} strokeWidth={2.5} />
        </button>
        <span className="w-7 text-center text-xs font-semibold text-[#1a2f5e]">{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:border-[#2563eb] hover:text-[#2563eb] hover:bg-[#2563eb]/5 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:text-gray-500 disabled:hover:bg-transparent transition-colors"
        >
          <Plus size={11} strokeWidth={2.5} />
        </button>
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </div>
    </div>
  )
}

function DimInput({ label, rawValue, unit, onChange, onBlur }: {
  label: string; rawValue: string; unit: string
  onChange: (s: string) => void; onBlur: () => void
}) {
  return (
    <div>
      <span className="block text-xs font-medium text-gray-500 mb-1.5">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number" min={0.5} max={50} step={0.5}
          value={rawValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className="w-20 h-7 border border-gray-200 rounded-md px-2 text-xs font-medium text-[#1a2f5e] focus:outline-none focus:ring-2 focus:ring-[#1a2f5e]/20 focus:border-[#1a2f5e]"
        />
        <span className="text-xs text-gray-400">{unit}</span>
      </div>
    </div>
  )
}

const selectCls =
  "w-full h-7 border border-gray-200 rounded-md px-2 text-xs font-medium text-[#1a2f5e] bg-white focus:outline-none focus:ring-2 focus:ring-[#1a2f5e]/20 focus:border-[#1a2f5e] cursor-pointer"

// ─── Main modal ───────────────────────────────────────────────────────────────

const FRAME_LABELS: Record<FrameType, string> = {
  "portal": "Portal",
  "diagonal-left": "Diagonal Left Braced",
  "diagonal-right": "Diagonal Right Braced",
  "x": "X Braced",
  "v": "V Braced",
  "inverted-v": "Inverted V Braced",
}

export function FrameTemplateModal({ onConfirm, onClose }: Props) {
  const [frameType, setFrameType] = useState<FrameType>("portal")
  const [numStories, setNumStories] = useState(2)
  const [numBays, setNumBays] = useState(2)
  const [storyHeight, setStoryHeight] = useState(3)
  const [storyHeightRaw, setStoryHeightRaw] = useState("3")
  const [bayWidth, setBayWidth] = useState(5)
  const [bayWidthRaw, setBayWidthRaw] = useState("5")
  const [section, setSection] = useState("iwf150")
  const [supportType, setSupportType] = useState<"fixed" | "pin">("fixed")

  function clampDim(raw: string, current: number, set: (v: number) => void, setRaw: (s: string) => void) {
    const v = parseFloat(raw)
    if (!isNaN(v) && v >= 0.5 && v <= 50) { set(v); setRaw(String(v)) }
    else setRaw(String(current))
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[600px] max-w-[calc(100vw-2rem)] p-6 overflow-y-auto max-h-[90dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-[#1a2f5e]">Frame Template</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex gap-5 items-start">

          {/* Left: type dropdown + preview */}
          <div className="shrink-0 sm:w-[248px]">
            <div className="mb-3">
              <span className="block text-xs font-medium text-gray-500 mb-1.5">Frame type</span>
              <select
                value={frameType}
                onChange={(e) => setFrameType(e.target.value as FrameType)}
                className={selectCls}
              >
                {(Object.keys(FRAME_LABELS) as FrameType[]).map((t) => (
                  <option key={t} value={t}>{FRAME_LABELS[t]}</option>
                ))}
              </select>
            </div>

            {/* Preview — hidden on small screens */}
            <div className="hidden sm:block bg-[#F0F2F5] rounded-lg p-2">
              <FramePreview
                numStories={numStories}
                numBays={numBays}
                supportType={supportType}
                frameType={frameType}
              />
            </div>
          </div>

          {/* Right: controls */}
          <div className="flex-1 pt-1 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Stepper label="Number of stories" value={numStories} min={1} max={8} onChange={setNumStories} />
              <Stepper label="Number of bays" value={numBays} min={1} max={6} onChange={setNumBays} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <DimInput
                label="Story height"
                rawValue={storyHeightRaw} unit="m"
                onChange={setStoryHeightRaw}
                onBlur={() => clampDim(storyHeightRaw, storyHeight, setStoryHeight, setStoryHeightRaw)}
              />
              <DimInput
                label="Bay width"
                rawValue={bayWidthRaw} unit="m"
                onChange={setBayWidthRaw}
                onBlur={() => clampDim(bayWidthRaw, bayWidth, setBayWidth, setBayWidthRaw)}
              />
            </div>

            <div>
              <span className="block text-xs font-medium text-gray-500 mb-1.5">Section</span>
              <select value={section} onChange={(e) => setSection(e.target.value)} className={selectCls}>
                {Object.values(defaultSections).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <span className="block text-xs font-medium text-gray-500 mb-1.5">Supports</span>
              <div className="flex gap-2">
                {(["fixed", "pin"] as const).map((t) => (
                  <ToggleButton
                    key={t}
                    active={supportType === t}
                    onClick={() => setSupportType(t)}
                    className="!flex-none h-7 px-4 text-xs font-medium"
                  >
                    {t === "fixed" ? "Fixed" : "Pinned"}
                  </ToggleButton>
                ))}
              </div>
            </div>

            <p className="text-[10px] text-gray-400 leading-relaxed">
              {numStories} {numStories === 1 ? "story" : "stories"} · {numBays} {numBays === 1 ? "bay" : "bays"} ·{" "}
              {(numStories * storyHeight).toFixed(1)} m tall · {(numBays * bayWidth).toFixed(1)} m wide ·{" "}
              {supportType === "fixed" ? "fixed" : "pinned"} bases
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="h-8 px-4 rounded-md text-xs font-medium border border-gray-200 bg-white text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onConfirm(buildFrameModel(numStories, numBays, storyHeight, bayWidth, section, supportType, frameType))
            }
            className="h-8 px-5 rounded-md text-xs font-semibold bg-[#2563eb] text-white hover:bg-[#1d4ed8] transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}