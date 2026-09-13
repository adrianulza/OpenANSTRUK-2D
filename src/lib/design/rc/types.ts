/**
 * RC per-section reinforcement input types. Pure domain module: no React imports.
 */

import type { SectionId } from "@/lib/model"
import type { DesignMode, ElementType } from "../core/types"
import type { RebarSize } from "./shared/rebar"

export interface BarLayer {
  count: number
  size: RebarSize
}

export interface RebarArrangement {
  top: BarLayer
  bottom: BarLayer
  /** Skin bars on each face — included in flexural capacity via the per-bar
   *  strain-compatibility solver (permitted by 9.7.2.3). */
  side: BarLayer
  stirrup: { size: RebarSize; spacing: number /* mm */ }
}

interface ColumnArrangementBase {
  size: RebarSize
  /** Transverse reinforcement type. Tied caps Pn,max at 0.80·Po, φc 0.65; spiral
   *  caps at 0.85·Po, φc 0.75 (22.4.2.1 / 21.2.2). Spiral is only valid on a
   *  circular section; rectangular columns are tied-only. */
  confinement?: "tied" | "spiral"
  /** Tie/hoop (or, when spiral, the spiral bar + pitch). */
  tie: { size: RebarSize; spacing: number /* mm */ }
}

/** Rectangular column: longitudinal bars on an nx × ny perimeter grid (corners
 *  shared): total = 2·nx + 2·ny − 4. */
export interface RectColumnArrangement extends ColumnArrangementBase {
  shape?: "rect"
  /** Bars along the width (top & bottom rows). */
  nx: number
  /** Bars along the height, including the corner rows. */
  ny: number
}

/** Circular column: `n` longitudinal bars on a single circumferential ring. */
export interface CircleColumnArrangement extends ColumnArrangementBase {
  shape: "circle"
  /** Total bars on the ring. */
  n: number
}

export type ColumnArrangement = RectColumnArrangement | CircleColumnArrangement

/** Narrow a ColumnArrangement to its circular variant. */
export function isCircle(arr: ColumnArrangement): arr is CircleColumnArrangement {
  return arr.shape === "circle"
}

export interface ColumnDesignInput {
  /** "As checked" perimeter grid. */
  checked: ColumnArrangement
  /** "As required": bar/tie sizes for the representative ring (ρg is solved). */
  required: { barSize: RebarSize; tieSize: RebarSize }
}

export interface RcSectionInput {
  material: "rc"
  sectionId: SectionId
  /** Beam vs column (auto = by orientation + axial threshold). */
  elementType: ElementType
  mode: DesignMode
  /** Clear cover to stirrup/tie, mm ("As checked" mode). */
  cover: number
  /** Cover to rebar centroid, mm ("As required" mode): d = h − dPrime. */
  dPrime: number
  /** End-zone (support, 2h) arrangement — "As checked" mode. */
  support: RebarArrangement
  /** Midspan arrangement — "As checked" mode. */
  midspan: RebarArrangement
  /** Column reinforcement (used when the member resolves to a column). */
  column: ColumnDesignInput
}

function defaultArrangement(): RebarArrangement {
  return {
    top: { count: 3, size: "D19" },
    bottom: { count: 2, size: "D19" },
    side: { count: 0, size: "D13" },
    stirrup: { size: "D10", spacing: 150 },
  }
}

function defaultColumnArrangement(): ColumnArrangement {
  return { shape: "rect", nx: 3, ny: 3, size: "D19", confinement: "tied", tie: { size: "D10", spacing: 100 } }
}

export function defaultCircleColumnArrangement(): CircleColumnArrangement {
  return { shape: "circle", n: 8, size: "D19", confinement: "spiral", tie: { size: "D10", spacing: 75 } }
}

export function defaultRcSectionInput(sectionId: SectionId): RcSectionInput {
  return {
    material: "rc",
    sectionId,
    // `auto` — resolved per member from orientation, promoted to column by the
    // ACI axial gate. It used to default to "beam", so a section named
    // "Column 500×500" was designed as a beam until the user noticed.
    elementType: "auto",
    mode: "required",
    cover: 40,
    dPrime: 50,
    support: defaultArrangement(),
    midspan: defaultArrangement(),
    column: {
      checked: defaultColumnArrangement(),
      required: { barSize: "D19", tieSize: "D10" },
    },
  }
}
