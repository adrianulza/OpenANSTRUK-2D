/**
 * Steel design has **no per-section user input**. Pure domain module.
 *
 * Every quantity AISC needs beyond the section geometry is either computed or
 * fixed by a documented convention, so there is nothing left for the user to
 * set:
 *
 * | Quantity | Source |
 * |----------|--------|
 * | element type (beam/column/brace) | inferred from geometry — `member-role.ts` |
 * | `Cb` | computed per combination from the moment diagram (F1-1) |
 * | `Lb` | the full member length; subdivide a member to express bracing |
 * | `K33`, `K22` | fixed at 1.0 — braced frames only |
 *
 * Unlike RC there is also no "required" vs "checked" split: there is no
 * rebar-style unknown to solve for, so steel design is always a CHECK of the
 * assigned section. Auto-selecting a lighter section from a catalogue is a
 * separate feature and out of scope.
 *
 * The `SteelSectionInput` type that used to live here carried `elementType`,
 * `Lb`, `Cb`, `K33` and `K22`. All five are gone: the first was on the wrong
 * entity (role is per member, not per section) and advertised an effect it did
 * not have; the rest are covered by the table above. See
 * `docs/DESIGN_STEEL.md` §S11 and §S13.
 */

export {}
