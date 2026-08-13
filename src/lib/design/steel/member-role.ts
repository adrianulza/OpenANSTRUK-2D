/**
 * Geometric member role for steel design. Pure domain module: no React imports.
 *
 * **Role does not change the check.** AISC 360 is organised by limit state
 * (Chapters D/E/F/G/H), not by member type: every steel member runs the same
 * Chapter H combined-force check, and a beam simply arrives at it with `Pr = 0`,
 * where H1-1b degenerates to `Mr/Mc`. This was confirmed against SAP2000 — three
 * simply supported beams with zero axial reported `RatioType = PMM`, equation
 * `(H1-1b)`, `PRatio = 0`, and a fully computed `PcComp`. Role therefore exists
 * only to label the schedule and to pick a report deck.
 *
 * That is why there is no user control for it. A per-section `elementType`
 * override used to exist; it was on the wrong entity (role is per MEMBER — one
 * section can serve as both a beam and a column) and it advertised an effect it
 * did not have.
 *
 * **Contrast with RC**, which keeps its type on the SECTION and settable there.
 * That is not an inconsistency: a concrete section's rebar definition *is* its
 * design type (a column takes a bar grid, a beam takes top/bottom bars —
 * different data), whereas nothing per-section differs between a steel beam and
 * a steel column. See `core/element-type.ts`.
 *
 * Since AISC **341** landed (v1.1.6) role is no longer purely presentational:
 * D1.2 bracing applies to beams only, and E3.4a SCWB partitions members by
 * role. It still changes no AISC 360 capacity. If a user-settable axis is ever
 * added here it should be SFRS membership, not this — seismic role is a
 * declaration about the lateral system, and no angle can tell you whether a
 * column participates in it.
 */

export type SteelMemberRole = "beam" | "column" | "brace"

/**
 * Half-angle tolerance in degrees. A **declared convention**, not a clause —
 * it matches the design-orientation rule SAP2000/ETABS use (near-vertical is a
 * column, near-horizontal a beam, anything else a brace).
 *
 * Known limitation: a portal-frame rafter pitched more than this reads as
 * `brace`, which is structurally wrong — it is a beam-column. Harmless while
 * role is presentational; revisit alongside AISC 341, where a misclassified
 * rafter would draw the wrong Table D1.1 limits.
 */
export const ROLE_ANGLE_TOL_DEG = 15

/**
 * Infer a member's role from its end coordinates.
 *
 * Uses |Δx| and |Δy|, so the result is **invariant under swapping i and j** —
 * a member's role cannot depend on which node the user clicked first.
 */
export function inferSteelRole(
  ax: number, ay: number, bx: number, by: number,
): SteelMemberRole {
  const dx = Math.abs(bx - ax)
  const dy = Math.abs(by - ay)
  // Degenerate (zero-length) members fall through to `beam`; they cannot be
  // designed anyway, and the solver rejects them upstream.
  if (dx === 0 && dy === 0) return "beam"

  const fromHorizontalDeg = (Math.atan2(dy, dx) * 180) / Math.PI
  if (fromHorizontalDeg <= ROLE_ANGLE_TOL_DEG) return "beam"
  if (90 - fromHorizontalDeg <= ROLE_ANGLE_TOL_DEG) return "column"
  return "brace"
}

/** Display label for a role. */
export function steelRoleLabel(role: SteelMemberRole): string {
  return role === "beam" ? "Beam" : role === "column" ? "Column" : "Brace"
}
