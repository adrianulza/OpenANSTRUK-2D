import { useState } from "react"
import { Minus, Plus } from "lucide-react"
import type { StructureModel } from "@/lib/model"
import { newNodeId, newMemberId, defaultSections } from "@/lib/model"

interface Props {
  onConfirm: (model: StructureModel) => void
  onClose: () => void
}

// ─── model builder ────────────────────────────────────────────────────────────

function buildBeamModel(numSpans: number, spanLength: number, section: string): StructureModel {
  const totalLength = numSpans * spanLength
  const startX = -totalLength / 2

  const nodes: StructureModel["nodes"] = {}
  const nodeIds: string[] = []
  for (let i = 0; i <= numSpans; i++) {
    const id = newNodeId()
    nodeIds.push(id)
    nodes[id] = { id, x: startX + i * spanLength, y: 0 }
  }

  const members: StructureModel["members"] = {}
  for (let i = 0; i < numSpans; i++) {
    const id = newMemberId()
    members[id] = { id, a: nodeIds[i], b: nodeIds[i + 1], section }
  }

  const supports: StructureModel["supports"] = {}
  supports[nodeIds[0]] = { nodeId: nodeIds[0], type: "pin" }
  for (let i = 1; i <= numSpans; i++) {
    supports[nodeIds[i]] = { nodeId: nodeIds[i], type: "roller" }
  }

  return { nodes, members, supports, sections: { ...defaultSections }, loads: {} }
}

// ─── SVG preview ──────────────────────────────────────────────────────────────

const SVG_W = 268
const SVG_H = 154
const PAD_X = 28
const BEAM_Y = 68
const USABLE_W = SVG_W - PAD_X * 2
const NAVY = "#1a2f5e"
const GRAY = "#64748b"
const TRI_H = 14
const TRI_W = 10
const GROUND_HALF = 14

function xPos(i: number, numSpans: number) {
  return PAD_X + (USABLE_W * i) / numSpans
}

function PinSupport({ x }: { x: number }) {
  const baseY = BEAM_Y + TRI_H
  const gY = baseY + 4
  const n = 5
  return (
    <g>
      <polygon points={`${x},${BEAM_Y} ${x - TRI_W},${baseY} ${x + TRI_W},${baseY}`} fill={NAVY} />
      <line x1={x - GROUND_HALF} y1={gY} x2={x + GROUND_HALF} y2={gY} stroke={NAVY} strokeWidth={1.5} />
      {Array.from({ length: n }, (_, k) => {
        const hx = x - GROUND_HALF + (k / (n - 1)) * GROUND_HALF * 2
        return <line key={k} x1={hx} y1={gY} x2={hx - 4} y2={gY + 5} stroke={NAVY} strokeWidth={1} />
      })}
    </g>
  )
}

function RollerSupport({ x }: { x: number }) {
  const baseY = BEAM_Y + TRI_H
  const cy = baseY + 8
  const gY = cy + 4
  return (
    <g>
      <polygon points={`${x},${BEAM_Y} ${x - TRI_W},${baseY} ${x + TRI_W},${baseY}`} fill={NAVY} />
      <circle cx={x - 4} cy={cy} r={3} fill="white" stroke={NAVY} strokeWidth={1.5} />
      <circle cx={x + 4} cy={cy} r={3} fill="white" stroke={NAVY} strokeWidth={1.5} />
      <line x1={x - GROUND_HALF} y1={gY} x2={x + GROUND_HALF} y2={gY} stroke={NAVY} strokeWidth={1.5} />
    </g>
  )
}

function BeamPreview({ numSpans, spanLength }: { numSpans: number; spanLength: number }) {
  const xs = Array.from({ length: numSpans + 1 }, (_, i) => xPos(i, numSpans))
  const showPerSpan = numSpans <= 5

  return (
    <svg width={SVG_W} height={SVG_H} className="select-none">
      {showPerSpan
        ? xs.slice(0, -1).map((x, i) => {
            const x2 = xs[i + 1]
            const midX = (x + x2) / 2
            const dY = BEAM_Y - 22
            return (
              <g key={i}>
                <line x1={x + 2} y1={dY} x2={x2 - 2} y2={dY} stroke={GRAY} strokeWidth={0.75} />
                <line x1={x} y1={dY - 4} x2={x} y2={dY + 4} stroke={GRAY} strokeWidth={0.75} />
                <line x1={x2} y1={dY - 4} x2={x2} y2={dY + 4} stroke={GRAY} strokeWidth={0.75} />
                <text x={midX} y={dY - 5} textAnchor="middle" fontSize={9} fill={GRAY} fontFamily="Inter, sans-serif">
                  {spanLength} m
                </text>
              </g>
            )
          })
        : (() => {
            const x0 = xs[0], xN = xs[numSpans]
            const midX = (x0 + xN) / 2
            const dY = BEAM_Y - 22
            return (
              <g>
                <line x1={x0 + 2} y1={dY} x2={xN - 2} y2={dY} stroke={GRAY} strokeWidth={0.75} />
                <line x1={x0} y1={dY - 4} x2={x0} y2={dY + 4} stroke={GRAY} strokeWidth={0.75} />
                <line x1={xN} y1={dY - 4} x2={xN} y2={dY + 4} stroke={GRAY} strokeWidth={0.75} />
                <text x={midX} y={dY - 5} textAnchor="middle" fontSize={9} fill={GRAY} fontFamily="Inter, sans-serif">
                  {numSpans} × {spanLength} m = {numSpans * spanLength} m
                </text>
              </g>
            )
          })()
      }

      <rect x={xs[0]} y={BEAM_Y - 4} width={xs[numSpans] - xs[0]} height={8} fill={NAVY} rx={1} />

      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={BEAM_Y} r={4} fill="white" stroke={NAVY} strokeWidth={1.5} />
      ))}

      {xs.map((x, i) =>
        i === 0
          ? <PinSupport key={i} x={x} />
          : <RollerSupport key={i} x={x} />
      )}

      <text x={xs[0]} y={SVG_H - 6} textAnchor="middle" fontSize={8} fill={GRAY} fontFamily="Inter, sans-serif">pin</text>
      <text x={xs[numSpans]} y={SVG_H - 6} textAnchor="middle" fontSize={8} fill={GRAY} fontFamily="Inter, sans-serif">roller</text>
    </svg>
  )
}

// ─── shared select style ──────────────────────────────────────────────────────

const selectCls =
  "w-full h-7 border border-gray-200 rounded-md px-2 text-xs font-medium text-[#1a2f5e] bg-white focus:outline-none focus:ring-2 focus:ring-[#1a2f5e]/20 focus:border-[#1a2f5e] cursor-pointer"

// ─── main modal ───────────────────────────────────────────────────────────────

export function BeamTemplateModal({ onConfirm, onClose }: Props) {
  const [numSpans, setNumSpans] = useState(1)
  const [spanLength, setSpanLength] = useState(5)
  const [spanLengthRaw, setSpanLengthRaw] = useState("5")
  const [section, setSection] = useState("iwf150")

  function clampSpans(n: number) { return Math.max(1, Math.min(10, n)) }

  function handleSpanLengthBlur() {
    const v = parseFloat(spanLengthRaw)
    if (!isNaN(v) && v >= 1 && v <= 50) {
      setSpanLength(v)
      setSpanLengthRaw(String(v))
    } else {
      setSpanLengthRaw(String(spanLength))
    }
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[560px] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-[#1a2f5e]">Beam Template</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex gap-6 items-start">
          {/* Preview */}
          <div className="shrink-0 bg-[#F0F2F5] rounded-lg p-2">
            <BeamPreview numSpans={numSpans} spanLength={spanLength} />
          </div>

          {/* Controls */}
          <div className="flex-1 flex flex-col gap-4 pt-1">
            {/* Number of spans */}
            <div>
              <span className="block text-xs font-medium text-gray-500 mb-1.5">Number of spans</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setNumSpans((n) => clampSpans(n - 1))}
                  disabled={numSpans <= 1}
                  className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Minus size={11} strokeWidth={2.5} />
                </button>
                <span className="w-7 text-center text-xs font-semibold text-[#1a2f5e]">{numSpans}</span>
                <button
                  onClick={() => setNumSpans((n) => clampSpans(n + 1))}
                  disabled={numSpans >= 10}
                  className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus size={11} strokeWidth={2.5} />
                </button>
                <span className="text-xs text-gray-400">max 10</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">
                {numSpans + 1} supports — pin at left, rollers at right
              </p>
            </div>

            {/* Span length */}
            <div>
              <span className="block text-xs font-medium text-gray-500 mb-1.5">Span length</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={50}
                  step={0.5}
                  value={spanLengthRaw}
                  onChange={(e) => setSpanLengthRaw(e.target.value)}
                  onBlur={handleSpanLengthBlur}
                  className="w-20 h-7 border border-gray-200 rounded-md px-2 text-xs font-medium text-[#1a2f5e] focus:outline-none focus:ring-2 focus:ring-[#1a2f5e]/20 focus:border-[#1a2f5e]"
                />
                <span className="text-xs text-gray-400">m</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">
                Total length: {(numSpans * spanLength).toFixed(1)} m
              </p>
            </div>

            {/* Section */}
            <div>
              <span className="block text-xs font-medium text-gray-500 mb-1.5">Section</span>
              <select value={section} onChange={(e) => setSection(e.target.value)} className={selectCls}>
                {Object.values(defaultSections).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="h-8 px-4 rounded-md text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(buildBeamModel(numSpans, spanLength, section))}
            className="h-8 px-5 rounded-md text-xs font-semibold bg-[#1a2f5e] text-white hover:bg-[#243d77] transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
