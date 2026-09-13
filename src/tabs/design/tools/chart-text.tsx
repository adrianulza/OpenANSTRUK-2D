/**
 * Shared SVG chart typography for the RC Advanced Capacity Report decks (beam +
 * column). Single source so both decks render labels at identical size, style,
 * and color.
 *
 * - FONT (10px) matches the app's text-[10px] standard; FONT_SUB (7.5px) is the
 *   true-subscript size used by SubText.
 * - NAVY is the primary annotation color; LABEL is the per-item label grey.
 */

export const FONT = 10 // app text-[10px]
export const FONT_SUB = 7.5
export const NAVY = "#1a2f5e"
export const LABEL = "#374151" // per-item label grey (gray-700)

/** SVG text with an optional subscript, optional normal-size suffix, and an
 *  optional trailing subscript: main_sub suffix _sub2 (e.g. f_s=0.5f_y). */
export function SubText({
  x, y, main, sub, suffix, sub2, fill, anchor = "start", weight,
}: {
  x: number
  y: number
  main: string
  sub?: string
  suffix?: string
  sub2?: string
  fill: string
  anchor?: "start" | "middle" | "end"
  weight?: number
}) {
  return (
    <text className="font-mono" x={x} y={y} fontSize={FONT} fill={fill} textAnchor={anchor} fontWeight={weight}>
      {main}
      {sub !== undefined && <tspan dy={2.5} fontSize={FONT_SUB}>{sub}</tspan>}
      {suffix !== undefined && <tspan dy={sub !== undefined ? -2.5 : 0} fontSize={FONT}>{suffix}</tspan>}
      {sub2 !== undefined && <tspan dy={2.5} fontSize={FONT_SUB}>{sub2}</tspan>}
    </text>
  )
}
