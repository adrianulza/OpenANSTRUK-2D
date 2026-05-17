import * as React from "react"
import { FLYOUT_PANEL_COLORS } from "@/lib/flyout-panel-colors"
import type { Load, DistributedLoad, PointLoad, StructureModel } from "@/lib/model"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { NumericInput } from "@/components/ui/numeric-input"

function DistributedLoadEditor({
  load,
  onApply,
}: {
  load: DistributedLoad
  onApply: (patch: Partial<Load>) => void
}) {
  const initMode = load.mode ?? "local-axis"
  const [editDistMode, setEditDistMode] = React.useState<"local-axis" | "global-axis">(initMode)
  const [editDistType, setEditDistType] = React.useState<"uniform" | "asymmetric">(() => {
    if (initMode === "local-axis") return (load.wStart ?? 0) !== (load.wEnd ?? 0) ? "asymmetric" : "uniform"
    return (load.wxStart ?? 0) !== (load.wxEnd ?? 0) || (load.wyStart ?? 0) !== (load.wyEnd ?? 0) ? "asymmetric" : "uniform"
  })
  const [editWStart, setEditWStart] = React.useState(load.wStart ?? 0)
  const [editWEnd, setEditWEnd] = React.useState(load.wEnd ?? 0)
  const [editWxStart, setEditWxStart] = React.useState(load.wxStart ?? 0)
  const [editWxEnd, setEditWxEnd] = React.useState(load.wxEnd ?? 0)
  const [editWyStart, setEditWyStart] = React.useState(load.wyStart ?? 0)
  const [editWyEnd, setEditWyEnd] = React.useState(load.wyEnd ?? 0)

  React.useEffect(() => {
    const mode = load.mode ?? "local-axis"
    setEditDistMode(mode)
    if (mode === "local-axis") {
      setEditWStart(load.wStart ?? 0)
      setEditWEnd(load.wEnd ?? 0)
      setEditDistType((load.wStart ?? 0) !== (load.wEnd ?? 0) ? "asymmetric" : "uniform")
    } else {
      setEditWxStart(load.wxStart ?? 0)
      setEditWxEnd(load.wxEnd ?? 0)
      setEditWyStart(load.wyStart ?? 0)
      setEditWyEnd(load.wyEnd ?? 0)
      setEditDistType((load.wxStart ?? 0) !== (load.wxEnd ?? 0) || (load.wyStart ?? 0) !== (load.wyEnd ?? 0) ? "asymmetric" : "uniform")
    }
  }, [load])

  const handleApply = () => {
    if (editDistMode === "local-axis") {
      const wEnd = editDistType === "asymmetric" ? editWEnd : editWStart
      onApply({ mode: "local-axis", wStart: editWStart, wEnd, wxStart: undefined, wxEnd: undefined, wyStart: undefined, wyEnd: undefined } as Partial<Load>)
    } else {
      const wxEnd = editDistType === "asymmetric" ? editWxEnd : editWxStart
      const wyEnd = editDistType === "asymmetric" ? editWyEnd : editWyStart
      onApply({ mode: "global-axis", wxStart: editWxStart, wxEnd, wyStart: editWyStart, wyEnd, wStart: undefined, wEnd: undefined } as Partial<Load>)
    }
  }

  const modeBtn = (mode: "local-axis" | "global-axis", label: string) => (
    <button onClick={() => setEditDistMode(mode)} className="flex-1 h-7 text-[11px] rounded-md transition-colors"
      style={editDistMode === mode ? { backgroundColor: FLYOUT_PANEL_COLORS.primary, color: 'white' } : { backgroundColor: '#f3f4f6', color: '#4b5563' }}>
      {label}
    </button>
  )
  const distBtn = (type: "uniform" | "asymmetric", label: string) => (
    <button onClick={() => setEditDistType(type)} className="flex-1 h-7 text-[11px] rounded-md transition-colors"
      style={editDistType === type ? { backgroundColor: FLYOUT_PANEL_COLORS.primary, color: 'white' } : { backgroundColor: '#f3f4f6', color: '#4b5563' }}>
      {label}
    </button>
  )

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-600">Input Mode</Label>
        <div className="flex gap-1">{modeBtn("local-axis", "Local-axis")}{modeBtn("global-axis", "Global Axis")}</div>
      </div>

      {editDistMode === "local-axis" && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Distribution</Label>
            <div className="flex gap-1">{distBtn("uniform", "Uniform")}{distBtn("asymmetric", "Asymmetric")}</div>
          </div>
          <div className="space-y-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">{editDistType === "asymmetric" ? "Start (i)" : "Load"}</Label>
              <div className="flex gap-2">
                <NumericInput value={editWStart} onChange={setEditWStart} className="h-7 text-xs font-mono flex-1" />
                <span className="text-xs text-gray-500 self-center whitespace-nowrap">kN/m</span>
              </div>
            </div>
            {editDistType === "asymmetric" && (
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">End (j)</Label>
                <div className="flex gap-2">
                  <NumericInput value={editWEnd} onChange={setEditWEnd} className="h-7 text-xs font-mono flex-1" />
                  <span className="text-xs text-gray-500 self-center whitespace-nowrap">kN/m</span>
                </div>
              </div>
            )}
          </div>
          <p className="text-[10px] text-gray-400 leading-snug">⊥ along +local-2 (i→j rotated 90° CCW)  ·  + that direction  ·  − opposite</p>
        </>
      )}

      {editDistMode === "global-axis" && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Distribution</Label>
            <div className="flex gap-1">{distBtn("uniform", "Uniform")}{distBtn("asymmetric", "Asymmetric")}</div>
          </div>
          <div className="space-y-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">X-axis (horizontal)</Label>
              <div className="flex gap-2">
                <NumericInput value={editWxStart} onChange={setEditWxStart} className="h-7 text-xs font-mono flex-1" />
                <span className="text-xs text-gray-500 self-center whitespace-nowrap">kN/m</span>
              </div>
              {editDistType === "asymmetric" && (
                <div className="flex gap-2">
                  <div className="text-[10px] text-gray-400 self-center">End (j)</div>
                  <NumericInput value={editWxEnd} onChange={setEditWxEnd} className="h-7 text-xs font-mono flex-1" />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Y-axis (vertical)</Label>
              <div className="flex gap-2">
                <NumericInput value={editWyStart} onChange={setEditWyStart} className="h-7 text-xs font-mono flex-1" />
                <span className="text-xs text-gray-500 self-center whitespace-nowrap">kN/m</span>
              </div>
              {editDistType === "asymmetric" && (
                <div className="flex gap-2">
                  <div className="text-[10px] text-gray-400 self-center">End (j)</div>
                  <NumericInput value={editWyEnd} onChange={setEditWyEnd} className="h-7 text-xs font-mono flex-1" />
                </div>
              )}
            </div>
          </div>
          <p className="text-[10px] text-gray-400 leading-snug">+ rightward (X)  ·  − leftward  ·  + upward (Y)  ·  − downward</p>
        </>
      )}

      <Button size="sm" className="w-full text-xs h-7" style={{ backgroundColor: FLYOUT_PANEL_COLORS.primary, color: 'white' }} onClick={handleApply}>
        Apply
      </Button>
    </div>
  )
}

export function ModifyLoadToolContent({
  selectedLoad,
  selectedLoadIds = [],
  model,
  onModifyByType,
}: {
  selectedLoad: Load | null
  selectedLoadIds?: string[]
  model: StructureModel | null
  onModify?: (patch: Partial<Load>) => void
  onModifyByType?: (type: "point" | "distributed", patch: Partial<Load>) => void
}) {
  const [editFx, setEditFx] = React.useState<number>(0)
  const [editFy, setEditFy] = React.useState<number>(0)

  const allSelected = React.useMemo(() => {
    if (!model) return { points: [] as PointLoad[], dists: [] as DistributedLoad[] }
    const ids = selectedLoadIds.length > 0 ? selectedLoadIds : (selectedLoad ? [selectedLoad.id] : [])
    const points: PointLoad[] = []
    const dists: DistributedLoad[] = []
    for (const id of ids) {
      const l = model.loads[id]
      if (!l) continue
      if (l.type === "point") points.push(l as PointLoad)
      else dists.push(l as DistributedLoad)
    }
    return { points, dists }
  }, [selectedLoadIds, selectedLoad, model])

  const hasPoints = allSelected.points.length > 0
  const hasDists = allSelected.dists.length > 0
  const totalCount = allSelected.points.length + allSelected.dists.length

  const firstPoint = allSelected.points[0] ?? null
  React.useEffect(() => {
    if (!firstPoint) return
    setEditFx(firstPoint.fx)
    setEditFy(firstPoint.fy)
  }, [firstPoint])

  if (totalCount === 0) {
    return (
      <p className="text-xs text-gray-500 leading-relaxed">
        Click a load or drag a box on the canvas to select loads
      </p>
    )
  }

  const handleApplyPoint = () => {
    onModifyByType?.("point", { fx: editFx, fy: editFy } as Partial<Load>)
  }

  const handleApplyDist = (patch: Partial<Load>) => {
    onModifyByType?.("distributed", patch)
  }

  return (
    <div className="space-y-3">
      {totalCount > 1 && (
        <div className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50 px-2.5 py-1.5">
          <span className="text-xs text-gray-600">{totalCount} loads selected</span>
        </div>
      )}

      {hasPoints && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Point Load</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Global axis</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-gray-500">X (rightward)</Label>
                <NumericInput value={editFx} onChange={setEditFx} className="h-7 text-xs font-mono w-full" />
              </div>
              <div>
                <Label className="text-[10px] text-gray-500">Y (upward)</Label>
                <NumericInput value={editFy} onChange={setEditFy} className="h-7 text-xs font-mono w-full" />
              </div>
            </div>
          </div>
          <Button size="sm" className="w-full text-xs h-7" style={{ backgroundColor: FLYOUT_PANEL_COLORS.primary, color: 'white' }} onClick={handleApplyPoint}>
            Apply
          </Button>
        </>
      )}

      {hasPoints && hasDists && (
        <div className="h-px bg-gray-100" />
      )}

      {hasDists && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Distributed Load</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>
          <DistributedLoadEditor load={allSelected.dists[0]} onApply={handleApplyDist} />
        </>
      )}
    </div>
  )
}
