import { useState } from "react"
import { resetIdCounter, type StructureModel, type Section } from "@/lib/model"
import {
  type UnitSettings,
  DEFAULT_UNIT_SETTINGS,
  displayE, parseE, labelE,
  displayI, parseI, labelI,
  displayA, parseA, labelA,
} from "@/lib/units"
import { EXAMPLES, EXAMPLE_IDS } from "./examples-data"

interface Props {
  onConfirm: (model: StructureModel, section: Section) => void
  onClose: () => void
  unitSettings?: UnitSettings
}

const selectCls =
  "w-full h-7 border border-gray-200 rounded-md px-2 text-xs font-medium text-[#1a2f5e] bg-white focus:outline-none focus:ring-2 focus:ring-[#1a2f5e]/20 focus:border-[#1a2f5e] cursor-pointer"

const inputCls =
  "w-full h-7 border border-gray-200 rounded-md px-2 text-xs font-medium text-[#1a2f5e] bg-white focus:outline-none focus:ring-2 focus:ring-[#1a2f5e]/20 focus:border-[#1a2f5e]"

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : parseFloat(n.toPrecision(6)).toString()
}

export function ExamplesModal({ onConfirm, onClose, unitSettings }: Props) {
  const u = unitSettings ?? DEFAULT_UNIT_SETTINGS
  const initialExample = EXAMPLES[EXAMPLE_IDS[0]]
  const [selectedExampleId, setSelectedExampleId] = useState<string>(EXAMPLE_IDS[0])
  const [E, setE] = useState(fmt(displayE(initialExample.defaultE, u)))
  const [I, setI] = useState(fmt(displayI(initialExample.defaultI, u)))
  const [A, setA] = useState(fmt(displayA(initialExample.defaultA, u)))
  const [notes, setNotes] = useState(initialExample?.notesTemplate || "")

  const example = EXAMPLES[selectedExampleId]

  const handleExampleChange = (id: string) => {
    const ex = EXAMPLES[id]
    setSelectedExampleId(id)
    setNotes(ex?.notesTemplate || "")
    setE(fmt(displayE(ex.defaultE, u)))
    setI(fmt(displayI(ex.defaultI, u)))
    setA(fmt(displayA(ex.defaultA, u)))
  }

  const handleConfirm = () => {
    const E_val   = parseE(parseFloat(E) || 1, u)
    const I33_val = parseI(parseFloat(I) || 1, u)
    const A_val   = parseA(parseFloat(A) || 1, u)

    resetIdCounter()
    const model = example.templateFn()

    const sectionId = "section"
    const newSection: Section = {
      id: sectionId,
      name: "section",
      E:   E_val,
      I33: I33_val,
      A:   A_val,
    }

    onConfirm(model, newSection)
  }

  if (!example) {
    return null
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[720px] max-w-[calc(100vw-2rem)] max-h-[85dvh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-[#1a2f5e]">Load Example Model</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col sm:flex-row gap-6">
          {/* Left column: Example selection, illustration, notes */}
          <div className="flex-1 flex flex-col gap-4">
            {/* Example dropdown */}
            <div>
              <span className="block text-xs font-medium text-gray-500 mb-1.5">Select Example</span>
              <select
                value={selectedExampleId}
                onChange={(e) => handleExampleChange(e.target.value)}
                className={selectCls}
              >
                {EXAMPLE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {EXAMPLES[id].title}
                  </option>
                ))}
              </select>
            </div>

            {/* SVG Illustration */}
            <div className="bg-[#F0F2F5] rounded-lg p-4 min-h-[180px] flex items-center justify-center">
              <div
                dangerouslySetInnerHTML={{ __html: example.svgIllustration }}
                className="w-full h-full flex items-center justify-center"
              />
            </div>

            {/* Notes section */}
            <div>
              <span className="block text-xs font-medium text-gray-500 mb-1.5">Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={`${inputCls} resize-none p-2 min-h-[60px] font-mono text-[10px]`}
                placeholder="Example notes..."
              />
            </div>
          </div>

          {/* Right column: Material properties */}
          <div className="w-48 flex flex-col gap-4">
            <div className="flex flex-col gap-3 pt-0">
              <h3 className="text-xs font-medium text-gray-500">Material Properties</h3>

              {/* E input */}
              <div>
                <label className="block text-[10px] font-medium text-gray-600 mb-1">E ({labelE(u)})</label>
                <input
                  type="number"
                  value={E}
                  onChange={(e) => setE(e.target.value)}
                  min={0.001}
                  step={0.1}
                  className={inputCls}
                />
              </div>

              {/* I input */}
              <div>
                <label className="block text-[10px] font-medium text-gray-600 mb-1">I ({labelI(u)})</label>
                <input
                  type="number"
                  value={I}
                  onChange={(e) => setI(e.target.value)}
                  min={0.001}
                  step={0.1}
                  className={inputCls}
                />
              </div>

              {/* A input */}
              <div>
                <label className="block text-[10px] font-medium text-gray-600 mb-1">A ({labelA(u)})</label>
                <input
                  type="number"
                  value={A}
                  onChange={(e) => setA(e.target.value)}
                  min={0.001}
                  step={0.1}
                  className={inputCls}
                />
              </div>
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