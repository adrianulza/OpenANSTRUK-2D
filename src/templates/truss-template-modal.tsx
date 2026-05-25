import { useState } from "react"
import { Minus, Plus } from "lucide-react"
import type { StructureModel } from "@/lib/model"
import { newNodeId, newMemberId, newLoadId, defaultSections } from "@/lib/model"

interface Props {
  onConfirm: (model: StructureModel) => void
  onClose: () => void
}

type TrussType = "warren" | "pratt" | "howe" | "flat" | "roof_howe" | "roof_fink"

const TRUSS_LABELS: Record<TrussType, string> = {
  warren:    "Bridge: Warren Truss",
  pratt:     "Bridge: Pratt Truss",
  howe:      "Bridge: Howe Truss",
  flat:      "Bridge: X-Braced Truss",
  roof_howe: "Roof: Howe Truss",
  roof_fink: "Roof: Fink Truss",
}

// ─── model builders ───────────────────────────────────────────────────────────

function buildTrussModel(
  numDiv: number,
  divLength: number,
  height: number,
  section: string,
  trussType: TrussType,
  topLoadMag: number,
  botLoadMag: number,
): StructureModel {
  const startX = -(numDiv * divLength) / 2
  const topY   =  height / 2
  const botY   = -height / 2

  const nodes: StructureModel["nodes"]     = {}
  const members: StructureModel["members"] = {}
  const supports: StructureModel["supports"] = {}
  const loads: StructureModel["loads"]     = {}
  const addM = (a: string, b: string) => {
    const id = newMemberId()
    members[id] = { id, a, b, section, memberType: "truss" }
  }
  const addLoad = (nodeId: string, magnitude: number) => {
    if (magnitude === 0) return
    const id = newLoadId()
    const fy = magnitude  // positive = upward
    loads[id] = { id, type: "point", nodeId, loadCaseId: "dead", fx: 0, fy }
  }

  if (trussType === "warren") {
    const botIds: string[] = []
    for (let i = 0; i <= numDiv; i++) {
      const id = newNodeId()
      botIds.push(id)
      nodes[id] = { id, x: startX + i * divLength, y: botY }
    }

    const topIds: string[] = []
    for (let i = 0; i < numDiv; i++) {
      const id = newNodeId()
      topIds.push(id)
      nodes[id] = { id, x: startX + (i + 0.5) * divLength, y: topY }
    }

    for (let i = 0; i < numDiv; i++) addM(botIds[i], botIds[i + 1])
    for (let i = 0; i < numDiv - 1; i++) addM(topIds[i], topIds[i + 1])
    for (let i = 0; i < numDiv; i++) {
      addM(botIds[i], topIds[i])
      addM(topIds[i], botIds[i + 1])
    }

    supports[botIds[0]]      = { nodeId: botIds[0],      type: "pin" }
    supports[botIds[numDiv]] = { nodeId: botIds[numDiv], type: "roller" }

    topIds.forEach((id) => addLoad(id, topLoadMag))
    for (let i = 1; i < numDiv; i++) addLoad(botIds[i], botLoadMag)

    return { nodes, members, supports, sections: { ...defaultSections }, loads }
  }

  // Pratt / Howe / X-Braced: full grid of top + bottom nodes
  const topIds: string[] = []
  const botIds: string[] = []
  for (let i = 0; i <= numDiv; i++) {
    const x  = startX + i * divLength
    const ti = newNodeId()
    const bi = newNodeId()
    topIds.push(ti); botIds.push(bi)
    nodes[ti] = { id: ti, x, y: topY }
    nodes[bi] = { id: bi, x, y: botY }
  }
  for (let i = 0; i < numDiv; i++) {
    addM(topIds[i], topIds[i + 1])
    addM(botIds[i], botIds[i + 1])
  }
  addM(topIds[0], botIds[0])
  addM(topIds[numDiv], botIds[numDiv])

  if (trussType === "pratt") {
    for (let i = 1; i < numDiv; i++) addM(topIds[i], botIds[i])
    for (let i = 0; i < numDiv; i++) {
      if (i < numDiv / 2) addM(topIds[i],     botIds[i + 1])
      else                addM(topIds[i + 1], botIds[i])
    }
  } else if (trussType === "howe") {
    for (let i = 1; i < numDiv; i++) addM(topIds[i], botIds[i])
    for (let i = 0; i < numDiv; i++) {
      if (i < numDiv / 2) addM(botIds[i],     topIds[i + 1])
      else                addM(botIds[i + 1], topIds[i])
    }
  } else {
    // X-braced
    for (let i = 1; i < numDiv; i++) addM(topIds[i], botIds[i])
    for (let i = 0; i < numDiv; i++) {
      addM(topIds[i],     botIds[i + 1])
      addM(topIds[i + 1], botIds[i])
    }
  }

  supports[botIds[0]]      = { nodeId: botIds[0],      type: "pin" }
  supports[botIds[numDiv]] = { nodeId: botIds[numDiv], type: "roller" }

  topIds.forEach((id) => addLoad(id, topLoadMag))
  for (let i = 1; i < numDiv; i++) addLoad(botIds[i], botLoadMag)

  return { nodes, members, supports, sections: { ...defaultSections }, loads }
}

// ─── roof howe model builder ──────────────────────────────────────────────────

function buildRoofHoweTrussModel(
  numDiv: number,
  divLength: number,
  height: number,
  section: string,
  topLoadMag: number,
  botLoadMag: number,
): StructureModel {
  const startX = -(numDiv * divLength) / 2
  const baseY  = -height / 2

  const nodes: StructureModel["nodes"]       = {}
  const members: StructureModel["members"]   = {}
  const supports: StructureModel["supports"] = {}
  const loads: StructureModel["loads"]       = {}

  const addM = (a: string, b: string) => {
    const id = newMemberId()
    members[id] = { id, a, b, section, memberType: "truss" }
  }
  const addLoad = (nodeId: string, magnitude: number) => {
    if (magnitude === 0) return
    const id = newLoadId()
    const fy = magnitude
    loads[id] = { id, type: "point", nodeId, loadCaseId: "dead", fx: 0, fy }
  }

  // Corner nodes (shared between top and bottom chord)
  const endLeft  = newNodeId()
  const endRight = newNodeId()
  nodes[endLeft]  = { id: endLeft,  x: startX,                     y: baseY }
  nodes[endRight] = { id: endRight, x: startX + numDiv * divLength, y: baseY }

  // Inner bottom chord nodes
  const botInner: string[] = []
  for (let i = 1; i < numDiv; i++) {
    const id = newNodeId()
    botInner.push(id)
    nodes[id] = { id, x: startX + i * divLength, y: baseY }
  }

  // Inner top chord nodes — follow the roof pitch
  const topInner: string[] = []
  for (let i = 1; i < numDiv; i++) {
    const id = newNodeId()
    topInner.push(id)
    const pitch = 1 - Math.abs(2 * i - numDiv) / numDiv
    nodes[id] = { id, x: startX + i * divLength, y: baseY + height * pitch }
  }

  const botAt = (i: number) => i === 0 ? endLeft : i === numDiv ? endRight : botInner[i - 1]
  const topAt = (i: number) => i === 0 ? endLeft : i === numDiv ? endRight : topInner[i - 1]

  // Chords
  for (let i = 0; i < numDiv; i++) addM(botAt(i), botAt(i + 1))
  for (let i = 0; i < numDiv; i++) addM(topAt(i), topAt(i + 1))

  // Verticals (inner panel points only)
  for (let i = 1; i < numDiv; i++) addM(topAt(i), botAt(i))

  // Howe diagonals — inner panels only. The corner panels (i=0 and
  // i=numDiv-1) would produce diagonals that coincide with the outermost
  // top-chord segments (endLeft↔topInner[0], topInner[N-2]↔endRight), so we
  // skip them. The remaining diagonals brace the inner panels symmetrically.
  const half = numDiv / 2
  for (let i = 1; i < numDiv - 1; i++) {
    if (i < half) addM(botAt(i),     topAt(i + 1))
    else          addM(topAt(i),     botAt(i + 1))
  }

  supports[endLeft]  = { nodeId: endLeft,  type: "pin" }
  supports[endRight] = { nodeId: endRight, type: "roller" }

  topInner.forEach((id) => addLoad(id, topLoadMag))
  botInner.forEach((id) => addLoad(id, botLoadMag))

  return { nodes, members, supports, sections: { ...defaultSections }, loads }
}

// ─── roof fink model builder ──────────────────────────────────────────────────

function buildRoofFinkTrussModel(
  numDiv: number,   // 3 | 5 | 7 | 9 | 11
  divLength: number,
  height: number,
  section: string,
  topLoadMag: number,
  botLoadMag: number,
): StructureModel {
  const N      = (numDiv - 1) / 2          // Fink level (1..5)
  const startX = -(numDiv * divLength) / 2
  const baseY  = -height / 2
  const peakY  =  baseY + height

  const nodes: StructureModel["nodes"]       = {}
  const members: StructureModel["members"]   = {}
  const supports: StructureModel["supports"] = {}
  const loads: StructureModel["loads"]       = {}

  const addM = (a: string, b: string) => {
    const id = newMemberId(); members[id] = { id, a, b, section, memberType: "truss" }
  }
  const addLoad = (nodeId: string, magnitude: number) => {
    if (magnitude === 0) return
    const id = newLoadId()
    const fy = magnitude
    loads[id] = { id, type: "point", nodeId, loadCaseId: "dead", fx: 0, fy }
  }

  // Bottom chord nodes (numDiv+1 total)
  const bot: string[] = []
  for (let i = 0; i <= numDiv; i++) {
    const id = newNodeId()
    bot.push(id)
    nodes[id] = { id, x: startX + i * divLength, y: baseY }
  }

  // Peak node
  const peakId = newNodeId()
  nodes[peakId] = { id: peakId, x: 0, y: peakY }

  // Left rafter intermediate nodes: fraction k/N from botL toward peak, k=1..N-1
  const tL: string[] = []
  for (let k = 1; k < N; k++) {
    const t = k / N
    const id = newNodeId()
    tL.push(id)
    nodes[id] = { id, x: startX * (1 - t), y: baseY + t * height }
  }

  // Right rafter intermediate nodes: fraction k/N from botR toward peak (symmetric)
  const tR: string[] = []
  for (let k = 1; k < N; k++) {
    const t = k / N
    const id = newNodeId()
    tR.push(id)
    nodes[id] = { id, x: -startX * (1 - t), y: baseY + t * height }
  }

  // Bottom chord
  for (let i = 0; i < numDiv; i++) addM(bot[i], bot[i + 1])

  // Left top chord: botL → tL[0] → … → tL[N-2] → peak
  addM(bot[0], N > 1 ? tL[0] : peakId)
  for (let k = 0; k < N - 2; k++) addM(tL[k], tL[k + 1])
  if (N > 1) addM(tL[N - 2], peakId)

  // Right top chord: peak → tR[N-2] → … → tR[0] → botR
  if (N > 1) addM(peakId, tR[N - 2])
  for (let k = N - 2; k > 0; k--) addM(tR[k], tR[k - 1])
  addM(N > 1 ? tR[0] : peakId, bot[numDiv])

  // Web members — left half (bot[1..N]) then right half (bot[numDiv-1..numDiv-N])
  for (let i = 1; i <= N; i++) {
    if (i <  N) addM(bot[i], tL[i - 1])
    if (i >  1) addM(bot[i], tL[i - 2])
    if (i === N) addM(bot[i], peakId)
  }
  for (let j = 1; j <= N; j++) {
    const idx = numDiv - j
    if (j <  N) addM(bot[idx], tR[j - 1])
    if (j >  1) addM(bot[idx], tR[j - 2])
    if (j === N) addM(bot[idx], peakId)
  }

  supports[bot[0]]      = { nodeId: bot[0],      type: "pin" }
  supports[bot[numDiv]] = { nodeId: bot[numDiv],  type: "roller" }

  ;[...tL, peakId, ...tR].forEach(id => addLoad(id, topLoadMag))
  for (let i = 1; i < numDiv; i++) addLoad(bot[i], botLoadMag)

  return { nodes, members, supports, sections: { ...defaultSections }, loads }
}

// ─── SVG constants ────────────────────────────────────────────────────────────

const SVG_W    = 268
const SVG_H    = 154
const PAD_X    = 22
const TOP_Y    = 26
const BOT_Y    = 104
const USABLE_W = SVG_W - PAD_X * 2
const NAVY     = "#1a2f5e"
const GRAY     = "#64748b"
const TRI_H    = 12
const TRI_W    = 9
const GROUND_HALF = 12

function xAt(i: number, n: number) {
  return PAD_X + (USABLE_W * i) / n
}

function PinSVG({ x }: { x: number }) {
  const baseY = BOT_Y + TRI_H
  const gY    = baseY + 3
  return (
    <g>
      <polygon points={`${x},${BOT_Y} ${x - TRI_W},${baseY} ${x + TRI_W},${baseY}`} fill={NAVY} />
      <line x1={x - GROUND_HALF} y1={gY} x2={x + GROUND_HALF} y2={gY} stroke={NAVY} strokeWidth={1.5} />
      {Array.from({ length: 5 }, (_, k) => {
        const hx = x - GROUND_HALF + (k / 4) * GROUND_HALF * 2
        return <line key={k} x1={hx} y1={gY} x2={hx - 4} y2={gY + 5} stroke={NAVY} strokeWidth={1} />
      })}
    </g>
  )
}

function RollerSVG({ x }: { x: number }) {
  const baseY = BOT_Y + TRI_H
  const cy    = baseY + 6
  const gY    = cy + 4
  return (
    <g>
      <polygon points={`${x},${BOT_Y} ${x - TRI_W},${baseY} ${x + TRI_W},${baseY}`} fill={NAVY} />
      <circle cx={x - 3.5} cy={cy} r={2.5} fill="white" stroke={NAVY} strokeWidth={1.5} />
      <circle cx={x + 3.5} cy={cy} r={2.5} fill="white" stroke={NAVY} strokeWidth={1.5} />
      <line x1={x - GROUND_HALF} y1={gY} x2={x + GROUND_HALF} y2={gY} stroke={NAVY} strokeWidth={1.5} />
    </g>
  )
}

// ─── SVG preview ──────────────────────────────────────────────────────────────

function RoofFinkPreview({ numDivisions }: { numDivisions: number }) {
  const n    = numDivisions
  const N    = (n - 1) / 2
  const r    = n <= 5 ? 3.5 : 2.5
  const span = USABLE_W
  const sx   = PAD_X            // left x
  const ex   = PAD_X + span     // right x
  const px   = SVG_W / 2        // peak x
  const py   = TOP_Y            // peak y
  const by   = BOT_Y            // bottom y

  const botX = (i: number) => sx + (span * i) / n
  const tLx  = (k: number) => sx + (px - sx) * (k / N)
  const tLy  = (k: number) => by  - (by - py) * (k / N)
  const tRx  = (k: number) => ex - (ex - px) * (k / N)
  const tRy  = (k: number) => tLy(k)   // symmetric height

  return (
    <svg width={SVG_W} height={SVG_H} className="select-none">
      {/* Bottom chord */}
      <line x1={sx} y1={by} x2={ex} y2={by} stroke={NAVY} strokeWidth={3} />

      {/* Left top chord segments */}
      {N === 1
        ? <line x1={sx} y1={by} x2={px} y2={py} stroke={NAVY} strokeWidth={3} />
        : <>
            <line x1={sx} y1={by} x2={tLx(1)} y2={tLy(1)} stroke={NAVY} strokeWidth={3} />
            {Array.from({ length: N - 2 }, (_, k) => (
              <line key={k} x1={tLx(k + 1)} y1={tLy(k + 1)} x2={tLx(k + 2)} y2={tLy(k + 2)} stroke={NAVY} strokeWidth={3} />
            ))}
            <line x1={tLx(N - 1)} y1={tLy(N - 1)} x2={px} y2={py} stroke={NAVY} strokeWidth={3} />
          </>
      }

      {/* Right top chord segments */}
      {N === 1
        ? <line x1={px} y1={py} x2={ex} y2={by} stroke={NAVY} strokeWidth={3} />
        : <>
            <line x1={px} y1={py} x2={tRx(N - 1)} y2={tRy(N - 1)} stroke={NAVY} strokeWidth={3} />
            {Array.from({ length: N - 2 }, (_, k) => (
              <line key={k} x1={tRx(N - 1 - k)} y1={tRy(N - 1 - k)} x2={tRx(N - 2 - k)} y2={tRy(N - 2 - k)} stroke={NAVY} strokeWidth={3} />
            ))}
            <line x1={tRx(1)} y1={tRy(1)} x2={ex} y2={by} stroke={NAVY} strokeWidth={3} />
          </>
      }

      {/* Web members — left half */}
      {Array.from({ length: N }, (_, idx) => {
        const i = idx + 1
        return (
          <g key={`wl${i}`}>
            {i < N  && <line x1={botX(i)} y1={by} x2={tLx(i)} y2={tLy(i)} stroke={NAVY} strokeWidth={1.5} />}
            {i > 1  && <line x1={botX(i)} y1={by} x2={tLx(i - 1)} y2={tLy(i - 1)} stroke={NAVY} strokeWidth={1.5} />}
            {i === N && <line x1={botX(i)} y1={by} x2={px} y2={py} stroke={NAVY} strokeWidth={1.5} />}
          </g>
        )
      })}

      {/* Web members — right half */}
      {Array.from({ length: N }, (_, idx) => {
        const j = idx + 1
        const bx = botX(n - j)
        return (
          <g key={`wr${j}`}>
            {j < N  && <line x1={bx} y1={by} x2={tRx(j)} y2={tRy(j)} stroke={NAVY} strokeWidth={1.5} />}
            {j > 1  && <line x1={bx} y1={by} x2={tRx(j - 1)} y2={tRy(j - 1)} stroke={NAVY} strokeWidth={1.5} />}
            {j === N && <line x1={bx} y1={by} x2={px} y2={py} stroke={NAVY} strokeWidth={1.5} />}
          </g>
        )
      })}

      {/* Nodes */}
      {Array.from({ length: n + 1 }, (_, i) => (
        <circle key={`b${i}`} cx={botX(i)} cy={by} r={r} fill="white" stroke={NAVY} strokeWidth={1.5} />
      ))}
      {Array.from({ length: N - 1 }, (_, k) => (
        <g key={`t${k}`}>
          <circle cx={tLx(k + 1)} cy={tLy(k + 1)} r={r} fill="white" stroke={NAVY} strokeWidth={1.5} />
          <circle cx={tRx(k + 1)} cy={tRy(k + 1)} r={r} fill="white" stroke={NAVY} strokeWidth={1.5} />
        </g>
      ))}
      <circle cx={px} cy={py} r={r} fill="white" stroke={NAVY} strokeWidth={1.5} />

      <PinSVG    x={sx} />
      <RollerSVG x={ex} />
      <text x={sx} y={SVG_H - 4} textAnchor="middle" fontSize={8} fill={GRAY} fontFamily="Inter, sans-serif">pin</text>
      <text x={ex} y={SVG_H - 4} textAnchor="middle" fontSize={8} fill={GRAY} fontFamily="Inter, sans-serif">roller</text>
    </svg>
  )
}

function RoofHowePreview({ numDivisions }: { numDivisions: number }) {
  const n    = numDivisions
  const r    = n <= 6 ? 3.5 : 2.5
  const xs   = Array.from({ length: n + 1 }, (_, i) => xAt(i, n))
  const span = BOT_Y - TOP_Y

  const topYAt = (i: number) => BOT_Y - span * (1 - Math.abs(2 * i - n) / n)
  const half   = n / 2

  return (
    <svg width={SVG_W} height={SVG_H} className="select-none">
      {/* Bottom chord */}
      <line x1={xs[0]} y1={BOT_Y} x2={xs[n]} y2={BOT_Y} stroke={NAVY} strokeWidth={3} />
      {/* Top chord */}
      {Array.from({ length: n }, (_, i) => (
        <line key={`tc${i}`} x1={xs[i]} y1={topYAt(i)} x2={xs[i + 1]} y2={topYAt(i + 1)} stroke={NAVY} strokeWidth={3} />
      ))}
      {/* Verticals */}
      {Array.from({ length: n - 1 }, (_, i) => (
        <line key={`v${i}`} x1={xs[i + 1]} y1={topYAt(i + 1)} x2={xs[i + 1]} y2={BOT_Y} stroke={NAVY} strokeWidth={1.5} />
      ))}
      {/* Howe diagonals — inner panels only (matches buildRoofHoweTrussModel) */}
      {Array.from({ length: Math.max(0, n - 2) }, (_, k) => {
        const i = k + 1
        return i < half
          ? <line key={`d${i}`} x1={xs[i]} y1={BOT_Y}     x2={xs[i + 1]} y2={topYAt(i + 1)} stroke={NAVY} strokeWidth={1.5} />
          : <line key={`d${i}`} x1={xs[i]} y1={topYAt(i)} x2={xs[i + 1]} y2={BOT_Y}         stroke={NAVY} strokeWidth={1.5} />
      })}
      {/* Nodes */}
      {xs.map((x, i) => (
        <g key={i}>
          {i > 0 && i < n && (
            <circle cx={x} cy={topYAt(i)} r={r} fill="white" stroke={NAVY} strokeWidth={1.5} />
          )}
          <circle cx={x} cy={BOT_Y} r={r} fill="white" stroke={NAVY} strokeWidth={1.5} />
        </g>
      ))}
      <PinSVG    x={xs[0]} />
      <RollerSVG x={xs[n]} />
      <text x={xs[0]} y={SVG_H - 4} textAnchor="middle" fontSize={8} fill={GRAY} fontFamily="Inter, sans-serif">pin</text>
      <text x={xs[n]} y={SVG_H - 4} textAnchor="middle" fontSize={8} fill={GRAY} fontFamily="Inter, sans-serif">roller</text>
    </svg>
  )
}

function TrussPreview({ numDivisions, trussType }: { numDivisions: number; trussType: TrussType }) {
  const n = numDivisions

  if (trussType === "roof_howe") return <RoofHowePreview numDivisions={n} />
  if (trussType === "roof_fink") return <RoofFinkPreview numDivisions={n} />

  if (trussType === "warren") {
    const botXs = Array.from({ length: n + 1 }, (_, i) => xAt(i, n))
    const topXs = Array.from({ length: n }, (_, i) => PAD_X + (USABLE_W * (i + 0.5)) / n)
    const r = n <= 6 ? 3.5 : 2.5

    return (
      <svg width={SVG_W} height={SVG_H} className="select-none">
        {Array.from({ length: n }, (_, i) => [
          <line key={`dl${i}`} x1={botXs[i]}   y1={BOT_Y} x2={topXs[i]} y2={TOP_Y} stroke={NAVY} strokeWidth={1.5} />,
          <line key={`dr${i}`} x1={topXs[i]} y1={TOP_Y} x2={botXs[i + 1]} y2={BOT_Y} stroke={NAVY} strokeWidth={1.5} />,
        ])}
        {Array.from({ length: n - 1 }, (_, i) => (
          <line key={`tc${i}`} x1={topXs[i]} y1={TOP_Y} x2={topXs[i + 1]} y2={TOP_Y} stroke={NAVY} strokeWidth={3} />
        ))}
        <line x1={botXs[0]} y1={BOT_Y} x2={botXs[n]} y2={BOT_Y} stroke={NAVY} strokeWidth={3} />
        {topXs.map((x, i) => (
          <circle key={`tn${i}`} cx={x} cy={TOP_Y} r={r} fill="white" stroke={NAVY} strokeWidth={1.5} />
        ))}
        {botXs.map((x, i) => (
          <circle key={`bn${i}`} cx={x} cy={BOT_Y} r={r} fill="white" stroke={NAVY} strokeWidth={1.5} />
        ))}
        <PinSVG    x={botXs[0]} />
        <RollerSVG x={botXs[n]} />
        <text x={botXs[0]} y={SVG_H - 4} textAnchor="middle" fontSize={8} fill={GRAY} fontFamily="Inter, sans-serif">pin</text>
        <text x={botXs[n]} y={SVG_H - 4} textAnchor="middle" fontSize={8} fill={GRAY} fontFamily="Inter, sans-serif">roller</text>
      </svg>
    )
  }

  // Pratt / X-Braced
  const xs = Array.from({ length: n + 1 }, (_, i) => xAt(i, n))
  const r  = n <= 6 ? 3.5 : 2.5
  const diagonals: [number, number, number, number][] = []
  const verticals: number[] = []

  if (trussType === "pratt") {
    for (let i = 1; i < n; i++) verticals.push(xs[i])
    for (let i = 0; i < n; i++) {
      if (i < n / 2) diagonals.push([xs[i],     TOP_Y, xs[i + 1], BOT_Y])
      else           diagonals.push([xs[i + 1], TOP_Y, xs[i],     BOT_Y])
    }
  } else if (trussType === "howe") {
    for (let i = 1; i < n; i++) verticals.push(xs[i])
    for (let i = 0; i < n; i++) {
      if (i < n / 2) diagonals.push([xs[i],     BOT_Y, xs[i + 1], TOP_Y])
      else           diagonals.push([xs[i + 1], BOT_Y, xs[i],     TOP_Y])
    }
  } else {
    // X-braced
    for (let i = 1; i < n; i++) verticals.push(xs[i])
    for (let i = 0; i < n; i++) {
      diagonals.push([xs[i],     TOP_Y, xs[i + 1], BOT_Y])
      diagonals.push([xs[i + 1], TOP_Y, xs[i],     BOT_Y])
    }
  }

  return (
    <svg width={SVG_W} height={SVG_H} className="select-none">
      {diagonals.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={NAVY} strokeWidth={1.5} />
      ))}
      {verticals.map((x, i) => (
        <line key={i} x1={x} y1={TOP_Y} x2={x} y2={BOT_Y} stroke={NAVY} strokeWidth={1.5} />
      ))}
      <line x1={xs[0]} y1={TOP_Y} x2={xs[0]} y2={BOT_Y} stroke={NAVY} strokeWidth={1.5} />
      <line x1={xs[n]} y1={TOP_Y} x2={xs[n]} y2={BOT_Y} stroke={NAVY} strokeWidth={1.5} />
      <line x1={xs[0]} y1={TOP_Y} x2={xs[n]} y2={TOP_Y} stroke={NAVY} strokeWidth={3} />
      <line x1={xs[0]} y1={BOT_Y} x2={xs[n]} y2={BOT_Y} stroke={NAVY} strokeWidth={3} />
      {xs.map((x, i) => (
        <g key={i}>
          <circle cx={x} cy={TOP_Y} r={r} fill="white" stroke={NAVY} strokeWidth={1.5} />
          <circle cx={x} cy={BOT_Y} r={r} fill="white" stroke={NAVY} strokeWidth={1.5} />
        </g>
      ))}
      <PinSVG    x={xs[0]} />
      <RollerSVG x={xs[n]} />
      <text x={xs[0]} y={SVG_H - 4} textAnchor="middle" fontSize={8} fill={GRAY} fontFamily="Inter, sans-serif">pin</text>
      <text x={xs[n]} y={SVG_H - 4} textAnchor="middle" fontSize={8} fill={GRAY} fontFamily="Inter, sans-serif">roller</text>
    </svg>
  )
}

// ─── shared select style ──────────────────────────────────────────────────────

const selectCls =
  "w-full h-7 border border-gray-200 rounded-md px-2 text-xs font-medium text-[#1a2f5e] bg-white focus:outline-none focus:ring-2 focus:ring-[#1a2f5e]/20 focus:border-[#1a2f5e] cursor-pointer"

// ─── main modal ───────────────────────────────────────────────────────────────

export function TrussTemplateModal({ onConfirm, onClose }: Props) {
  const [trussType, setTrussType] = useState<TrussType>("warren")

  const [numDiv, setNumDiv]             = useState(4)
  const [divLength, setDivLength]       = useState(2.5)
  const [divLengthRaw, setDivLengthRaw] = useState("2.5")
  const [height, setHeight]             = useState(2)
  const [heightRaw, setHeightRaw]       = useState("2")
  const [section, setSection]           = useState("iwf150")
  const [topLoad, setTopLoad]           = useState(-1)
  const [topLoadRaw, setTopLoadRaw]     = useState("-1")
  const [botLoad, setBotLoad]           = useState(-1)
  const [botLoadRaw, setBotLoadRaw]     = useState("-1")

  function clampDiv(n: number) { return Math.max(2, Math.min(12, n)) }

  const ROOF_HOWE_NAMES: Record<number, string> = {
    4: "Single Howe Truss", 6: "Double Howe Truss", 8: "Triple Howe Truss",
    10: "Quadruple Howe Truss", 12: "Quintuple Howe Truss",
  }
  const ROOF_FINK_NAMES: Record<number, string> = {
    3: "Simple Fink Truss", 5: "Double Fink Truss", 7: "Triple Fink Truss",
    9: "Quadruple Fink Truss", 11: "Quintuple Fink Truss",
  }

  function handleTrussTypeChange(t: TrussType) {
    setTrussType(t)
    if (t === "roof_howe") {
      setNumDiv((n) => { const e = n % 2 === 0 ? n : n + 1; return Math.max(4, Math.min(12, e)) })
    } else if (t === "roof_fink") {
      setNumDiv((n) => { const o = n % 2 === 1 ? n : n + 1; return Math.max(3, Math.min(11, o)) })
    }
  }

  function handleDivLengthBlur() {
    const v = parseFloat(divLengthRaw)
    if (!isNaN(v) && v >= 0.5 && v <= 20) { setDivLength(v); setDivLengthRaw(String(v)) }
    else setDivLengthRaw(String(divLength))
  }

  function handleHeightBlur() {
    const v = parseFloat(heightRaw)
    if (!isNaN(v) && v >= 0.5 && v <= 10) { setHeight(v); setHeightRaw(String(v)) }
    else setHeightRaw(String(height))
  }

  function handleTopLoadBlur() {
    const v = parseFloat(topLoadRaw)
    if (!isNaN(v)) { setTopLoad(v); setTopLoadRaw(String(v)) }
    else setTopLoadRaw(String(topLoad))
  }

  function handleBotLoadBlur() {
    const v = parseFloat(botLoadRaw)
    if (!isNaN(v)) { setBotLoad(v); setBotLoadRaw(String(v)) }
    else setBotLoadRaw(String(botLoad))
  }

  function handleConfirm() {
    if (trussType === "roof_howe")
      onConfirm(buildRoofHoweTrussModel(numDiv, divLength, height, section, topLoad, botLoad))
    else if (trussType === "roof_fink")
      onConfirm(buildRoofFinkTrussModel(numDiv, divLength, height, section, topLoad, botLoad))
    else
      onConfirm(buildTrussModel(numDiv, divLength, height, section, trussType, topLoad, botLoad))
  }

  const inputCls = "w-20 h-7 border border-gray-200 rounded-md px-2 text-xs font-medium text-[#1a2f5e] focus:outline-none focus:ring-2 focus:ring-[#1a2f5e]/20 focus:border-[#1a2f5e]"

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[580px] max-w-[calc(100vw-2rem)] p-6 overflow-y-auto max-h-[90dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-[#1a2f5e]">Truss Template</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex gap-6 items-start">
          {/* Left: type selector + preview */}
          <div className="shrink-0 flex flex-col gap-2">
            <select
              value={trussType}
              onChange={(e) => handleTrussTypeChange(e.target.value as TrussType)}
              className={selectCls}
              style={{ width: SVG_W + 16 }}
            >
              {(Object.keys(TRUSS_LABELS) as TrussType[]).map((t) => (
                <option key={t} value={t}>{TRUSS_LABELS[t]}</option>
              ))}
            </select>
            {/* Preview — hidden on small screens */}
            <div className="hidden sm:flex bg-[#F0F2F5] rounded-lg p-2">
              <TrussPreview numDivisions={numDiv} trussType={trussType} />
            </div>
          </div>

          {/* Right: inputs */}
          <div className="flex-1 flex flex-col gap-4 pt-1">
            {/* Number of divisions */}
            <div>
              <span className="block text-xs font-medium text-gray-500 mb-1.5">Number of divisions</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (trussType === "roof_howe") setNumDiv((n) => Math.max(4,  n - 2))
                    else if (trussType === "roof_fink") setNumDiv((n) => Math.max(3, n - 2))
                    else setNumDiv((n) => clampDiv(n - 1))
                  }}
                  disabled={trussType === "roof_howe" ? numDiv <= 4 : trussType === "roof_fink" ? numDiv <= 3 : numDiv <= 2}
                  className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:border-[#2563eb] hover:text-[#2563eb] hover:bg-[#2563eb]/5 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:text-gray-500 disabled:hover:bg-transparent transition-colors"
                >
                  <Minus size={11} strokeWidth={2.5} />
                </button>
                <span className="w-7 text-center text-xs font-semibold text-[#1a2f5e]">{numDiv}</span>
                <button
                  onClick={() => {
                    if (trussType === "roof_howe") setNumDiv((n) => Math.min(12, n + 2))
                    else if (trussType === "roof_fink") setNumDiv((n) => Math.min(11, n + 2))
                    else setNumDiv((n) => clampDiv(n + 1))
                  }}
                  disabled={trussType === "roof_howe" ? numDiv >= 12 : trussType === "roof_fink" ? numDiv >= 11 : numDiv >= 12}
                  className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:border-[#2563eb] hover:text-[#2563eb] hover:bg-[#2563eb]/5 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:text-gray-500 disabled:hover:bg-transparent transition-colors"
                >
                  <Plus size={11} strokeWidth={2.5} />
                </button>
                <span className="text-xs text-gray-400">
                  {trussType === "roof_fink" ? "max 11" : "max 12"}
                </span>
              </div>
              {trussType === "roof_howe" && ROOF_HOWE_NAMES[numDiv] && (
                <p className="text-[10px] text-gray-400 mt-1.5">{ROOF_HOWE_NAMES[numDiv]}</p>
              )}
              {trussType === "roof_fink" && ROOF_FINK_NAMES[numDiv] && (
                <p className="text-[10px] text-gray-400 mt-1.5">{ROOF_FINK_NAMES[numDiv]}</p>
              )}
            </div>

            {/* Division length */}
            <div>
              <span className="block text-xs font-medium text-gray-500 mb-1.5">Division length</span>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0.5} max={20} step={0.5}
                  value={divLengthRaw}
                  onChange={(e) => setDivLengthRaw(e.target.value)}
                  onBlur={handleDivLengthBlur}
                  className={inputCls}
                />
                <span className="text-xs text-gray-400">m</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">
                Total length: {(numDiv * divLength).toFixed(1)} m
              </p>
            </div>

            {/* Height */}
            <div>
              <span className="block text-xs font-medium text-gray-500 mb-1.5">Height</span>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0.5} max={10} step={0.5}
                  value={heightRaw}
                  onChange={(e) => setHeightRaw(e.target.value)}
                  onBlur={handleHeightBlur}
                  className={inputCls}
                />
                <span className="text-xs text-gray-400">m</span>
              </div>
            </div>

            {/* Section */}
            <div>
              <span className="block text-xs font-medium text-gray-500 mb-1.5">Section</span>
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className={selectCls}
              >
                {Object.values(defaultSections).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Top chord point loads */}
            <div>
              <span className="block text-xs font-medium text-gray-500 mb-1.5">Top chord load (all nodes)</span>
              <div className="flex items-center gap-2">
                <input
                  type="number" step={0.5}
                  value={topLoadRaw}
                  onChange={(e) => setTopLoadRaw(e.target.value)}
                  onBlur={handleTopLoadBlur}
                  className={inputCls}
                />
                <span className="text-xs text-gray-400">kN</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">gravity, positive = up</p>
            </div>

            {/* Bottom chord point loads */}
            <div>
              <span className="block text-xs font-medium text-gray-500 mb-1.5">Bottom chord load (free nodes)</span>
              <div className="flex items-center gap-2">
                <input
                  type="number" step={0.5}
                  value={botLoadRaw}
                  onChange={(e) => setBotLoadRaw(e.target.value)}
                  onBlur={handleBotLoadBlur}
                  className={inputCls}
                />
                <span className="text-xs text-gray-400">kN</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">gravity, positive = up</p>
            </div>
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
            onClick={handleConfirm}
            className="h-8 px-5 rounded-md text-xs font-semibold bg-[#2563eb] text-white hover:bg-[#1d4ed8] transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}