/**
 * Member verdict — the single source of truth for what the Design tab SAYS
 * about a member, in words rather than numbers.
 *
 * The canvas used to derive its labels inline, inside a `useCallback` closure
 * that no test could reach, and it showed different things for RC and steel by
 * accident rather than by rule. Everything that decides a member's verdict now
 * lives here, as a pure function of the member result, so that:
 *
 *   - the canvas is a renderer, not a policy layer;
 *   - `validation/design_labels_smoke.mts` can assert every state produces a
 *     visible label — the bug this module was written to kill was members that
 *     silently rendered nothing, which reads as "the design didn't run";
 *   - the schedule and the flyouts can say the same words as the canvas.
 *
 * Two questions are answered separately because they fail separately:
 *   STRENGTH   — do the capacity equations pass? → `Overstressed`
 *   DETAILING  — can it be built and hinge as assumed? → `Insufficient Detailing`
 * A section can satisfy every equation and still be unbuildable, so detailing
 * never rides on the D/C number.
 *
 * Pure domain module: no React imports.
 */

import {
  COLOR_DESIGN_DETAIL,
  COLOR_DESIGN_FAIL,
  COLOR_DESIGN_LABEL,
  COLOR_DESIGN_LOW,
  COLOR_DESIGN_MUTED,
  designColorForDC,
} from "@/lib/constants"
import type { DetailingCheck, MemberDesignResult } from "./types"

// ── Verdict shape ────────────────────────────────────────────────────────────

export type VerdictLevel =
  | "satisfied"     // every capacity and every detailing rule met
  | "overstressed"  // a capacity equation is exceeded
  | "detailing"     // capacities pass, a detailing rule does not
  | "not-designed"  // refused: unsupported section, out-of-scope shape, no result

export interface MemberVerdict {
  level: VerdictLevel
  /** Top-side pill text — the member's status in words. */
  top: string
  /**
   * Bottom-side pill causes, e.g. ["Flexural", "Shear"]. More than one is
   * normal and is the point: a member can fail two channels at once, and
   * showing only the governing one hides work the engineer still has to do.
   */
  causes: string[]
  /** Governing D/C, when the member has one. Undefined in RC "required" mode. */
  dc?: number
  /** Pill text colour. */
  color: string
}

/** Bottom pill text, or "" when there is nothing to say. */
export function causeText(v: MemberVerdict): string {
  return v.causes.join(" · ")
}

// ── Governing D/C ────────────────────────────────────────────────────────────

/**
 * The one number that answers "how close to capacity is this member?".
 *
 * Undefined in RC "required" mode, which is not a check but a solve: it reports
 * the steel a member NEEDS, so there is no ratio — only adequate / inadequate.
 */
export function memberDesignDC(r: MemberDesignResult): number | undefined {
  if (r.status !== "designed") return undefined

  if (r.material === "steel") {
    const st = r.steel
    if (!st) return undefined
    // Chapter H and Chapter G are separate limit states; the member is as
    // utilised as its worst one.
    return Math.max(st.ratio, st.shearRatio)
  }

  if (r.mode === "required") return undefined

  if (r.kind === "column") {
    // The RC column strategy already folds shear into worstFlexureDC.
    return r.worstFlexureDC
  }

  // RC beam, checked: flexure and shear are independent channels.
  let dc = r.worstFlexureDC ?? 0
  for (const z of Object.values(r.zones ?? {})) {
    dc = Math.max(dc, z.shear.dc ?? 0)
  }
  return dc
}

// ── Detailing ────────────────────────────────────────────────────────────────

/**
 * Detailing verdicts for a member, gathered from wherever the strategy put
 * them. RC beam/column checks arrive pre-grouped on `result.detailing`; steel's
 * live inside its seismic block and are lifted here, so a caller never has to
 * know which material stores what where.
 */
export function memberDetailing(r: MemberDesignResult): DetailingCheck[] {
  const out: DetailingCheck[] = [...(r.detailing ?? [])]

  const sq = r.steel?.seismic
  if (sq) {
    for (const e of sq.elements) {
      out.push({
        group: "Ductility",
        status: e.pass ? "pass" : "fail",
        text: `${e.name} λ = ${e.lambda.toFixed(1)} ${e.pass ? "≤" : ">"} ${e.limit.toFixed(1)}`,
        clause: "341 D1.1",
      })
    }
    if (sq.bracing) {
      // Advisory, never a failure: Lb ≡ the full modelled length in a 2D model,
      // so a "failure" here usually means the member was not subdivided at its
      // real brace points. See DESIGN_STEEL.md §S11.4.
      out.push({
        group: "Bracing",
        status: sq.bracing.pass ? "pass" : "warn",
        text: `Lb = ${sq.bracing.Lb.toFixed(2)} m vs Lb,max ${sq.bracing.LbMax.toFixed(2)} m`,
        clause: "341 D1.2",
      })
    }
  }

  // Strong-column-weak-beam, both materials. Set by the run-design post-pass;
  // absent (undefined) means the check does not apply to this member.
  const scwb = r.kind === "column"
    ? r.material === "steel" ? r.steel?.scwbPass : r.column?.scwbPass
    : undefined
  if (scwb !== undefined) {
    out.push({
      group: "SCWB",
      status: scwb ? "pass" : "fail",
      text: scwb ? "Strong-column-weak-beam satisfied" : "Column is weaker than the beams it frames into",
      clause: r.material === "steel" ? "341 E3.4a" : "18.7.3.2",
    })
  }

  return out
}

/** Detailing groups with at least one failing check, in a stable order. */
function failingDetailingGroups(checks: DetailingCheck[]): string[] {
  const seen: string[] = []
  for (const c of checks) {
    if (c.status !== "fail") continue
    if (!seen.includes(c.group)) seen.push(c.group)
  }
  return seen
}

// ── Strength causes ──────────────────────────────────────────────────────────

/**
 * Which capacity channels are exceeded. The vocabulary is deliberately the
 * engineer's, not the code's: "Axial-Moment" rather than "H1-1b", because the
 * question a red member raises is *what do I resize*, not *which equation*.
 * The governing equation still travels alongside for steel, where it is
 * genuinely diagnostic.
 */
function strengthCauses(r: MemberDesignResult): string[] {
  const causes: string[] = []

  if (r.material === "steel") {
    const st = r.steel
    if (!st) return causes
    if (st.ratio > 1 || !Number.isFinite(st.ratio)) {
      // "flexure-only" is the F-chapter path taken when Pr is exactly zero;
      // H1/H2 mean axial and moment were checked together. A member with axial
      // but no moment is an axial failure, not a combined one.
      const flexureOnly = st.equation === "flexure-only"
      const noMoment = Math.abs(st.MrMax) < 1e-9
      causes.push(flexureOnly ? "Flexural" : noMoment ? "Axial" : "Axial-Moment")
    }
    if (st.shearRatio > 1 || !Number.isFinite(st.shearRatio)) causes.push("Shear")
    return causes
  }

  // ── RC ──
  if (r.kind === "column") {
    const col = r.column
    if (!col) return causes
    const interactionFails =
      r.mode === "required" ? !col.adequate : !(col.worstDC <= 1)
    if (interactionFails) causes.push("Axial-Moment")
    if (col.shear && !col.shear.pass) causes.push("Shear")
    return causes
  }

  // RC beam: flexure per zone, then shear.
  const zones = Object.values(r.zones ?? {})
  const flexFails =
    r.mode === "required"
      ? zones.some((z) => !z.flexure.adequate)
      : zones.some((z) => !(z.flexure.dc <= 1))
  if (flexFails) causes.push("Flexural")
  if (r.worstShearPass === false) causes.push("Shear")
  return causes
}

// ── The verdict ──────────────────────────────────────────────────────────────

/** Why a member was refused, in the fewest words that stay honest. */
function refusalText(r: MemberDesignResult): string {
  switch (r.status) {
    case "axial-exceeded":
      return "Not designed — axial exceeds beam scope"
    case "not-implemented":
      return "Not designed — outside code scope"
    case "no-result":
      return "Not designed — no analysis result"
    default:
      return "Not designed — unsupported section"
  }
}

function formatDC(dc: number | undefined): string {
  if (dc === undefined) return ""
  return Number.isFinite(dc) ? dc.toFixed(2) : "> 1"
}

/**
 * The full verdict for one member. Total: every possible result — including
 * every refusal — produces a non-empty `top`, because a member that renders
 * nothing is indistinguishable from a member that passed.
 */
export function memberVerdict(r: MemberDesignResult): MemberVerdict {
  if (r.status !== "designed") {
    return { level: "not-designed", top: refusalText(r), causes: [], color: COLOR_DESIGN_MUTED }
  }

  const dc = memberDesignDC(r)
  const strength = strengthCauses(r)
  const detailing = failingDetailingGroups(memberDetailing(r))

  if (strength.length > 0) {
    // Detailing failures are still listed: fixing the size does not fix the bars.
    return {
      level: "overstressed",
      top: `Overstressed (D/C ${formatDC(dc) || "> 1"})`,
      causes: [...strength, ...detailing],
      dc,
      color: COLOR_DESIGN_FAIL,
    }
  }

  if (detailing.length > 0) {
    return {
      level: "detailing",
      top: "Insufficient Detailing",
      causes: detailing,
      dc,
      color: COLOR_DESIGN_DETAIL,
    }
  }

  const shown = formatDC(dc)
  if (shown) {
    return { level: "satisfied", top: `Satisfied ${shown}`, causes: [], dc, color: COLOR_DESIGN_LABEL }
  }

  // RC "as required" reaches here with no D/C, and that is not an omission: the
  // mode sizes the steel to exactly meet the demand, so a capacity ratio would
  // read 1.00 on every adequate member and carry no information. ρ used / ρ max
  // does answer the question a D/C is asked for — how much room is left — so a
  // satisfied member is never reduced to a bare word.
  const util = r.rhoUtil
  const utilShown = util !== undefined && Number.isFinite(util) ? ` ρ ${util.toFixed(2)}` : ""
  return {
    level: "satisfied",
    top: `Satisfied${utilShown}`,
    causes: [],
    dc,
    color: COLOR_DESIGN_LABEL,
  }
}

// ── Member colour ────────────────────────────────────────────────────────────

/**
 * Stroke colour for a member on the Design canvas.
 *
 * Note what this does NOT do: branch on `mode` to decide whether a D/C is
 * meaningful. That was the old rule, and because steel results carry no mode,
 * every steel member landed in the binary "required" branch and drew red at
 * D/C 0.04. Material is asked first, mode second.
 */
export function memberDisplayColor(r: MemberDesignResult): string {
  if (r.status !== "designed") return COLOR_DESIGN_MUTED

  const v = memberVerdict(r)
  // Red means "too small", amber means "built wrong". Collapsing the two into
  // red sends the engineer to resize a section that is already the right size.
  if (v.level === "overstressed") return COLOR_DESIGN_FAIL
  if (v.level === "detailing") return COLOR_DESIGN_DETAIL

  // RC "required" mode has no ratio — it is adequate or it is not.
  if (r.material === "rc" && r.mode === "required") return COLOR_DESIGN_LOW

  return designColorForDC(memberDesignDC(r) ?? 0)
}
