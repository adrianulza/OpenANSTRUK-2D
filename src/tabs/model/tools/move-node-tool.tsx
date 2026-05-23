import * as React from "react"
import type { StructureModel } from "@/lib/model"
import { Label } from "@/components/ui/label"
import { NumericInput } from "@/components/ui/numeric-input"
import { ToggleButton, ApplyButton } from "@/components/flyout-shared"
import { formatValue } from "@/lib/constants"
import { X } from "lucide-react"

export function MoveNodeToolContent({
  model,
  moveNodeMode,
  onMoveNodeModeChange,
  moveNodeCoordMode,
  onMoveNodeCoordModeChange,
  moveNodeSelectedId,
  onMoveNodeSelectId,
  onMoveNode,
}: {
  model?: StructureModel
  moveNodeMode: "coordinates" | "screen"
  onMoveNodeModeChange?: (mode: "coordinates" | "screen") => void
  moveNodeCoordMode: "set" | "offset"
  onMoveNodeCoordModeChange?: (mode: "set" | "offset") => void
  moveNodeSelectedId: string | null
  onMoveNodeSelectId?: (id: string | null) => void
  onMoveNode?: (nodeId: string, x: number, y: number) => void
}) {
  const node = moveNodeSelectedId ? model?.nodes[moveNodeSelectedId] : null
  const [inputX, setInputX] = React.useState(0)
  const [inputY, setInputY] = React.useState(0)

  React.useEffect(() => {
    if (moveNodeCoordMode === "set" && node) {
      setInputX(node.x)
      setInputY(node.y)
    } else {
      setInputX(0)
      setInputY(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveNodeSelectedId, moveNodeCoordMode, node?.x, node?.y])

  const handleApply = () => {
    if (!moveNodeSelectedId || !node) return
    if (moveNodeCoordMode === "set") {
      onMoveNode?.(moveNodeSelectedId, inputX, inputY)
    } else {
      onMoveNode?.(moveNodeSelectedId, node.x + inputX, node.y + inputY)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <ToggleButton
          active={moveNodeMode === "coordinates"}
          onClick={() => onMoveNodeModeChange?.("coordinates")}
          className="h-8 text-[10px] font-medium"
        >By Coordinates</ToggleButton>
        <ToggleButton
          active={moveNodeMode === "screen"}
          onClick={() => { onMoveNodeModeChange?.("screen"); onMoveNodeSelectId?.(null) }}
          className="h-8 text-[10px] font-medium"
        >On-Screen</ToggleButton>
      </div>

      {moveNodeMode === "coordinates" && (
        <div className="space-y-2.5">
          {!moveNodeSelectedId ? (
            <p className="text-xs text-gray-500 leading-relaxed">
              Click a node on the canvas to select it.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">
                  Node {moveNodeSelectedId} — ({formatValue(node?.x ?? 0)}, {formatValue(node?.y ?? 0)})
                </span>
                <button
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  onClick={() => onMoveNodeSelectId?.(null)}
                  title="Deselect"
                ><X size={12} /></button>
              </div>

              <div className="flex gap-1.5">
                <ToggleButton
                  active={moveNodeCoordMode === "set"}
                  onClick={() => onMoveNodeCoordModeChange?.("set")}
                  className="h-7 text-[10px] font-medium"
                >Set Position</ToggleButton>
                <ToggleButton
                  active={moveNodeCoordMode === "offset"}
                  onClick={() => onMoveNodeCoordModeChange?.("offset")}
                  className="h-7 text-[10px] font-medium"
                >Offset</ToggleButton>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-gray-500">{moveNodeCoordMode === "offset" ? "ΔX (m)" : "X (m)"}</Label>
                  <NumericInput value={inputX} onChange={setInputX} className="h-7 text-xs font-mono w-full" />
                </div>
                <div>
                  <Label className="text-[10px] text-gray-500">{moveNodeCoordMode === "offset" ? "ΔY (m)" : "Y (m)"}</Label>
                  <NumericInput value={inputY} onChange={setInputY} className="h-7 text-xs font-mono w-full" />
                </div>
              </div>

              <ApplyButton onClick={handleApply}>Apply</ApplyButton>
            </>
          )}
        </div>
      )}

      {moveNodeMode === "screen" && (
        <p className="text-xs text-gray-500 leading-relaxed">
          Click and hold a node on the canvas, then drag it to its new position and release.
        </p>
      )}
    </div>
  )
}
