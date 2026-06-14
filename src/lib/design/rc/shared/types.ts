/**
 * Shared RC design contract types — code-agnostic. Geometry (shared/) and the
 * per-code strategies (codes/) both depend on these; the types never carry any
 * code-specific math, only the shapes that cross the layer boundary.
 */

/** A reinforcing bar reduced to (depth from the compression fibre, area). */
export interface ColumnBar {
  /** Depth from the extreme COMPRESSION fibre, mm. */
  d: number
  /** Bar area, mm². */
  area: number
}

/** One detailing-check verdict (produced by a code module, rendered by the UI). */
export interface ArrangementCheck {
  status: "pass" | "warn" | "fail"
  text: string
  clause: string
}

export interface TransverseChecks {
  checks: ArrangementCheck[]
  /** Trailing advisory notes (placement along the span isn't modelled). */
  notes: string[]
}
