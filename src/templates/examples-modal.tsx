import { useState } from "react"
import type { StructureModel, Section } from "@/lib/model"
import { EXAMPLES, EXAMPLE_IDS } from "./examples-data"

interface Props {
  onConfirm: (model: StructureModel, section: Section) => void
  onClose: () => void
}

const selectCls =
  "w-full h-7 border border-gray-200 rounded-md px-2 text-xs font-medium text-[#1a2f5e] bg-white focus:outline-none focus:ring-2 focus:ring-[#1a2f5e]/20 focus:border-[#1a2f5e] cursor-pointer"

const inputCls =
  "w-full h-7 border border-gray-200 rounded-md px-2 text-xs font-medium text-[#1a2f5e] bg-white focus:outline-none focus:ring-2 focus:ring-[#1a2f5e]/20 focus:border-[#1a2f5e]"

export function ExamplesModal({ onConfirm, onClose }: Props) {
  const [selectedExampleId, setSelectedExampleId] = useState<string>(EXAMPLE_IDS[0])
  const initialExample = EXAMPLES[EXAMPLE_IDS[0]]
  const [E, setE] = useState(String(initialExample.defaultE))
  const [I, setI] = useState(String(initialExample.defaultI))
  const [A, setA] = useState(String(initialExample.defaultA))
  const [notes, setNotes] = useState(initialExample?.notesTemplate || "")

  const example = EXAMPLES[selectedExampleId]

  const handleExampleChange = (id: string) => {
    const ex = EXAMPLES[id]
    setSelectedExampleId(id)
    setNotes(ex?.notesTemplate || "")
    setE(String(ex.defaultE))
    setI(String(ex.defaultI))
    setA(String(ex.defaultA))
  }

  const handleConfirm = () => {
    const E_val = parseFloat(E) || 1
    const I_val = parseFloat(I) || 1
    const A_val = parseFloat(A) || 1

    // Create the model from template
    const model = example.templateFn()

    // Create a unique section for this example
    const sectionId = `example-${selectedExampleId}`
    const newSection: Section = {
      id: sectionId,
      name: example.title,
      E: E_val,
      I: I_val,
      A: A_val,
      W: 0.001, // placeholder
      nu: 0.2,  // default Poisson's ratio
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
        className="bg-white rounded-xl shadow-2xl w-[720px] max-h-[85vh] overflow-y-auto p-6"
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
        <div className="flex gap-6">
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
                <label className="block text-[10px] font-medium text-gray-600 mb-1">E (kN/m²)</label>
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
                <label className="block text-[10px] font-medium text-gray-600 mb-1">I (m⁴)</label>
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
                <label className="block text-[10px] font-medium text-gray-600 mb-1">A (m²)</label>
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
            className="h-8 px-4 rounded-md text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="h-8 px-5 rounded-md text-xs font-semibold bg-[#1a2f5e] text-white hover:bg-[#243d77] transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
