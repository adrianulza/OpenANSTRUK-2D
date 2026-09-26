import { X } from "lucide-react"
import type { SiteClass, SiteTableView } from "@/lib/seismic/site"

/**
 * The site coefficient table, opened from the clause callout beside Fa or Fv.
 *
 * ⚠ NO MATH HERE. Every cell, the refusal marker and the footnote arrive as
 * data from `siteTable()`, and a cell reads as refused exactly where
 * `siteCoefficients` flags that coefficient — both go through one `refusals()`
 * in `site.ts`. Deriving the marks in this component instead would let the
 * table show a number the engine declines to use, and there is no way for a
 * reader to tell which one is lying. `smoke_seismic_code` §5 sweeps every cell
 * of both tables in both codes to keep that tied.
 *
 * ⚠ A POPOVER INSIDE A MODAL, deliberately. The alternatives — a second modal,
 * or a link that closes the dialog — both break the premise the dialog is built
 * on: that a wrong site class should be visible while it is still being typed.
 * The dialog owns which callout is open and closes it on Escape BEFORE closing
 * itself, so the two-stage ladder behaves the way the About popover already
 * does against App's Escape chain.
 *
 * It is anchored, not portalled, so it scrolls with the summary it belongs to.
 */
export function SiteTablePopover({
  view,
  activeClass,
  value,
  at,
  onClose,
}: {
  view: SiteTableView
  /** The site class in force — its row is tinted. */
  activeClass: SiteClass
  /** The coefficient the engine actually returned, after any override. */
  value: number
  /** The Ss (for Fa) or S1 (for Fv) it was read at. */
  at: number
  onClose: () => void
}) {
  // "Fa" or "Fv" — the last token of the title, and what the axis is indexed by.
  const which = view.title.endsWith("Fa") ? "Fa" : "Fv"
  const axis = which === "Fa" ? "Ss" : "S₁"

  return (
    <div
      data-site-table
      className="absolute left-0 top-full z-20 mt-1 w-[330px] rounded-lg border border-gray-200 bg-white p-2.5 shadow-lg"
    >
      <div className="mb-1.5 flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[10px] font-medium leading-snug text-[#1a2f5e]">
          {view.title}
        </p>
        <button
          type="button"
          aria-label="Close table"
          onClick={onClose}
          className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={12} />
        </button>
      </div>

      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="text-[9px] uppercase tracking-wide text-gray-400">
            <th className="pb-1 text-left font-semibold">{axis}</th>
            {view.anchors.map((a, i) => (
              <th key={a} className="pb-1 text-right font-semibold">
                {i === 0 ? `≤${a}` : i === view.anchors.length - 1 ? `≥${a}` : a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono text-gray-700">
          {view.rows.map((row) => {
            const active = row.cls === activeClass
            return (
              <tr
                key={row.cls}
                data-site-table-row={row.cls}
                data-site-table-active={active ? row.cls : undefined}
                className={`border-t border-gray-50 ${active ? "bg-[#1a2f5e]/5" : ""}`}
              >
                <td
                  className={`py-0.5 pr-1 font-sans ${
                    active ? "font-semibold text-[#1a2f5e]" : "text-gray-500"
                  }`}
                >
                  {row.cls}
                </td>
                {row.cells.map((cell, i) => (
                  <td
                    key={i}
                    className={`py-0.5 text-right ${
                      cell === "refused" ? "font-sans text-[8px] text-amber-700" : ""
                    }`}
                  >
                    {cell === "refused" ? view.refusalLabel : cell.toFixed(1)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>

      <p className="mt-1.5 border-t border-gray-100 pt-1.5 font-mono text-[10px] text-[#1e293b]">
        {axis} = {at.toFixed(2)} → {which} = {value.toFixed(2)}
      </p>
      <p className="mt-0.5 text-[9px] leading-snug text-gray-400">{view.footnote}</p>
    </div>
  )
}
