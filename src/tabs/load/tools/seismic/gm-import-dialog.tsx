/**
 * Import a ground-motion record — ported from OpenANSTRUK-3D's import window.
 *
 * One acceleration per line (blank lines skipped, `#` lines are comments),
 * pasted or read from a text file, at a uniform Δt. The preview is the same
 * chart the seismic window draws, so what OK saves is what was seen.
 */

import { useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"

import { NumInline } from "@/components/dialog-fields"
import { Z_NESTED } from "@/lib/z-layers"
import {
  BUILT_IN_RECORDS,
  groundMotionId,
  type GroundMotionRecord,
  type GroundMotionUnit,
} from "@/lib/seismic/ground-motion"
import { AccelerogramChart } from "./accelerogram-chart"

export interface GmImportDialogProps {
  /** The records already imported, for collision refusal. */
  existing: readonly GroundMotionRecord[]
  onCommit: (record: GroundMotionRecord) => void
  onCancel: () => void
}

type Parse = { ok: true; values: number[] } | { ok: false; reason: string }

/**
 * One acceleration per line. A line holding two numbers (time, value) takes
 * the second, so a two-column export pastes as is.
 */
function parseValues(text: string): Parse {
  const values: number[] = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === "" || line.startsWith("#")) continue
    const parts = line.split(/[\s,;]+/).filter(Boolean)
    const v = Number(parts[parts.length - 1])
    if (!Number.isFinite(v)) {
      return { ok: false, reason: `Line ${i + 1} is not a number: "${line.slice(0, 24)}"` }
    }
    values.push(v)
  }
  if (values.length < 2) {
    return { ok: false, reason: "Paste at least two acceleration values, one per line." }
  }
  return { ok: true, values }
}

const LABEL = "text-[10px] font-semibold uppercase tracking-wide text-gray-400"

export function GmImportDialog({ existing, onCommit, onCancel }: GmImportDialogProps) {
  const [name, setName] = useState("")
  const [dt, setDt] = useState(0.02)
  const [unit, setUnit] = useState<GroundMotionUnit>("g")
  const [text, setText] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const parsed = useMemo(() => parseValues(text), [text])
  const id = groundMotionId(name)
  const collision =
    id !== "" &&
    (BUILT_IN_RECORDS.some((r) => r.id === id) || existing.some((r) => r.id === id))

  const blocker =
    name.trim() === ""
      ? "Name the record first."
      : collision
        ? `A record named "${name.trim()}" already exists — pick another name.`
        : !(dt > 0)
          ? "The time step must be positive."
          : !parsed.ok
            ? parsed.reason
            : null

  const preview: GroundMotionRecord | null =
    parsed.ok && dt > 0
      ? {
          id: id || "preview",
          name: name.trim() || "Imported record",
          dt,
          unit,
          values: parsed.values,
          source: "Imported by the user",
        }
      : null

  const loadFile = async (file: File) => {
    setText(await file.text())
    if (name.trim() === "") setName(file.name.replace(/\.[^.]+$/, ""))
  }

  const body = (
    <div className="flex max-h-[calc(100dvh-1rem)] w-[min(600px,96vw)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-2">
        <span className="text-sm font-medium text-[#1e293b]">Import ground motion</span>
        <button
          aria-label="Close"
          onClick={onCancel}
          className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden p-3 sm:flex-row">
        <div className="w-full shrink-0 space-y-2.5 sm:w-[220px]">
          <label className="block space-y-1">
            <span className={LABEL}>Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kobe 1995 NS"
              className="h-7 w-full rounded-md border border-gray-200 px-2 font-mono text-[11px] text-gray-700"
            />
          </label>

          <label className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-[11px] text-gray-600">Time step, Δt</span>
            <NumInline value={dt} unit="s" ariaLabel="Time step dt" onChange={setDt} />
          </label>

          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-[11px] text-gray-600">Unit</span>
            <div className="flex gap-1">
              {(["g", "m/s2"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`h-7 w-[44px] rounded-md border font-mono text-[11px] ${
                    unit === u
                      ? "border-[#1a2f5e] bg-[#1a2f5e] text-white"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {u === "g" ? "g" : "m/s²"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className={LABEL}>Accelerations</span>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="h-6 rounded-md border border-gray-200 px-2 font-mono text-[10px] text-gray-600 hover:border-[#2563eb] hover:text-[#2563eb]"
              >
                Load file…
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.csv,.dat,.at2,text/plain"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void loadFile(file)
                  e.target.value = ""
                }}
              />
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              placeholder={"0.0063\n0.00364\n0.00099\n…"}
              className="h-[120px] w-full resize-none rounded-md border border-gray-200 p-2 font-mono text-[11px] text-gray-700 sm:h-[150px]"
            />
          </div>

          {blocker !== null && (text !== "" || name.trim() !== "") && (
            <p className="text-[10px] leading-snug text-amber-600">{blocker}</p>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="h-[200px] rounded-lg border border-gray-200 bg-[#F0F2F5] p-2 sm:h-auto sm:min-h-[240px] sm:flex-1">
            {preview ? (
              <AccelerogramChart
                strips={[
                  { key: preview.id, label: preview.name, record: preview, scale: 1, unit: preview.unit },
                ]}
              />
            ) : (
              <p className="p-2 text-[11px] text-gray-500">The record draws here before it is saved.</p>
            )}
          </div>
          {preview && (
            <p className="font-mono text-[10px] text-gray-500">
              {preview.values.length} pts · Δt {dt} s · {((preview.values.length - 1) * dt).toFixed(2)} s
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-100 px-4 py-2">
        <button
          onClick={onCancel}
          className="h-8 rounded-md border border-gray-200 px-4 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          disabled={blocker !== null}
          title={blocker ?? undefined}
          onClick={() => {
            if (blocker !== null || !preview) return
            onCommit({ ...preview, id })
          }}
          className={`h-8 rounded-md px-6 text-xs font-medium ${
            blocker !== null
              ? "bg-gray-200 text-gray-400"
              : "bg-[#1a2f5e] text-white transition-transform hover:scale-[1.02] active:scale-95"
          }`}
        >
          Import
        </button>
      </div>
    </div>
  )

  return createPortal(
    <div
      style={{ zIndex: Z_NESTED }}
      className="fixed inset-0 flex items-center justify-center bg-black/25 p-2 sm:p-4"
    >
      {body}
    </div>,
    document.body,
  )
}
