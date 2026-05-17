# Changelog

All notable changes to OpenAnstruk-2D are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.0.3] — Theory-Pure Sign Convention

**Diagram rendering & distributed load convention**

### Changed
- **Single local-axis rule.** Local-2 axis is now `(-s, c)` — local-1 (i→j unit vector) rotated +90° CCW — for **every** member, with no normalization, no quadrant flips, and no `isVertical` special cases. AFD, SFD, BMD, distributed-load arrows, and the solver's `q1, q2` all use the same rule.
- **Invert toggles are now pure user preferences.** `invertSFD` and `invertBMD` both default to **off**. They mirror the display side, swap colors, and negate label signs together — they no longer compensate for an inconsistent convention.
- **`local-axis` distributed loads** now act consistently in the +local-2 direction regardless of member orientation. A consequence: the physical load direction depends on the member's i→j ordering. Reversing the a/b nodes of a member rotates +local-2 by 180° and flips the load direction.
- Template 4 (Portal Lateral) `wStart`/`wEnd` value sign adjusted so the physical lateral loading is preserved under the new convention.
- Load tool UI hint updated from "+ outward · − inward" to "+ along +local-2 (i→j rotated 90° CCW) · − opposite" — orientation-neutral phrasing.

### Removed
- `perpWorld` (`ny ≥ 0` normalized perpendicular) → replaced by `local2World` (pure local-2).
- `isVertical` flip blocks in SFD and BMD drawers (AFD never had one).
- `q1, q2` quadrant-flip blocks in `solver.ts` assembly and recovery — solver math (`localStiffness`, `transformMatrix`, FEF formula, end-force extraction) remains byte-stable.

### Documentation
- Rewrote sign-convention sections in `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/visual-spec.md`, and `docs/USER_GUIDE.md` to reflect the single rule.

### Notes
- Reactions, displacements, and end-force magnitudes are unchanged on all built-in templates.
- Diagram **side** may visually change for non-horizontal members compared to prior releases — this is the intended fix; the convention is now derivable from i→j direction alone.
- User-saved models that use `local-axis` distributed loads on members drawn in "non-standard" orientations may render the load direction flipped after this change; review distributed-load arrows on existing models after upgrade.

---

## [1.0.2] — 2026-05-17

**Tab-sliced project structure refactor, parametric section authoring, and one critical bug fix.**

### Added
- **Parametric section authoring** — pick a `materialClass` (concrete / steel) + `shape` + dimensions; the system computes A, I33, I22, section moduli, plastic moduli, etc. via `lib/sections/compute.ts`. Advanced panel lets users override derived values.
- **New section shapes** — Tee (T), Angle (L), CHS (circular hollow), RHS (rectangular hollow) added to the parametric catalogue, alongside existing Rect, Circle, and I-WF.
- Section properties verified against reference values.
- Material catalogue cap raised from 50 → 100 entries.

### Changed
- **Tab-sliced project structure.** Source reorganized into per-tab vertical slices (`src/tabs/{model,load,analyze}/tools/`), shared canvas primitives extracted to `src/canvas/`, and pure domain logic isolated under `src/lib/`. Same app, same behavior, same UI — internal reorganization to make future features (Load Cases, design checks, self-weight) clean folder additions instead of God-file edits.
- `flyout-panel.tsx`: 2169 → 517 lines (−76%); now a thin router on `(activeTab, activeTool)`.
- `structural-canvas.tsx`: 2703 → 2344 lines (−13%); moved to `src/canvas/`.
- `src/features/material/` split: pure computation → `src/lib/sections/`, React UI → `src/tabs/model/tools/material/`. `src/features/` folder removed entirely.
- Code deduplication: `perpWorld` unified (was duplicated in canvas + drawLoads); `splitByZeroCrossings` extracted (was ~50 lines duplicated between SFD and BMD).
- `NumericInput` and `pinIcon`/`rollerIcon`/`fixedIcon` promoted to `src/components/ui/`.

### Fixed
- **Material tool flyout rendered blank** after New Canvas or Beam/Frame/Truss template apply. Root cause: `activeSection` defaulted to `"section"` — a key present in static examples but missing from `createEmptyModel` and parametric template builders. Fix: introduced `firstSectionId(m)` helper invoked from all four model-swap paths so `activeSection` is invariant-preserving.
- **Grid misalignment** corrected.
- **Move-node on-screen mode** restored.

### Documentation
- `docs/ARCHITECTURE.md` rewritten for the tab-sliced structure; added import-direction rules, "Adding Features" recipes, "New section shape" recipe.
- `REFACTOR_PLAN.md` kept in repo as historical reference for the phased migration.
- `development.md` updated.

### Notes
- `solver.ts` was byte-identical to v1.0.1 — sign conventions and numerical output preserved through the refactor.
- Build: PASS (~3.7s, 561 KB bundle).

---

## [1.0.1] — 2026-05-14

**Mobile & Canvas UX**

### Added
- **Zoom** — scroll-wheel zoom on desktop; pinch-to-zoom on mobile (0.1× – 3× range)
- **Adaptive View** — line widths, node sizes, and arrowheads scale with zoom level so the structure stays readable at any zoom
- **Snap to Node** toggle — independently snap cursor to nearby existing nodes
- **Snap to Grid** toggle — grid snapping is now user-controllable, not always-on
- **Show Dimensions** toggle — live member-length label displayed while drawing
- All four canvas toggles surfaced in the Settings popover (status bar)
- Mobile-responsive landing page — hero, feature grid, and nav adapt to small screens
- Touch panning on the app canvas (one-finger drag on mobile)
- Mobile warning modal on the app shell for unsupported screen sizes
- Cloudflare Pages deployment config (`wrangler.toml`, `.npmrc`)
- GitHub PR template and CODEOWNERS file

### Fixed
- Flyout panel now scrollable and touch-friendly on mobile
- Template modals (beam, frame, truss, examples) sized correctly on small screens
- Nav bar and tool sidebar layout adjusted for narrow viewports
- Status bar condensed for mobile
- SPA root redirect fixed (`/` → `/html/index.html`) for Cloudflare and Netlify

### Changed
- App URL updated to `openanstruk.org`
- Contact email updated to `team@openanstruk.org`
- Axis gizmo and load arrows scale correctly with adaptive view zoom

---

## [1.0.0] — 2026-05-09

**Initial public release.**

- Interactive canvas — nodes, members (frame + truss), supports, snap-to-grid
- Point loads and distributed loads (local-axis and global-axis modes)
- Direct stiffness method (DSM) solver — runs entirely in the browser
- Shear force, bending moment, axial force, and deformation diagrams
- Invertible SFD/BMD; diagram scale and deformation scale sliders
- Parametric template builder for beams, frames, and trusses
- Five pre-built example models with SVG previews
- Unit system settings (kN/m default)
- MIT licensed, open source
