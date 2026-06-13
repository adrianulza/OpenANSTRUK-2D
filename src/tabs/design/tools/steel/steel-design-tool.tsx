/**
 * STEEL — structural steel design (AISC 360-16 / SNI 1729:2020).
 *
 * Placeholder tool. Steel member design is not yet implemented; this exposes the
 * tool slot in the Design tab so the workflow is visible. Features land in a
 * later pass.
 */
export function SteelDesignToolContent() {
  return (
    <div className="space-y-3">
      <div className="rounded bg-gray-50 border border-gray-200 px-2 py-3 space-y-1.5">
        <p className="text-[10px] font-semibold text-[#1a2f5e] leading-snug">
          Steel Design — Coming Soon
        </p>
        <p className="text-[10px] text-gray-500 leading-snug">
          Structural steel member design (AISC 360-16 / SNI 1729:2020) is not yet
          implemented. This tool is a placeholder for upcoming flexure, shear,
          and compression checks.
        </p>
      </div>
    </div>
  )
}
