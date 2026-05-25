# Changelog

All notable changes to OpenAnstruk-2D are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.0.6] — 2026-05-25

**Analysis diagnostics, lazy solver, and a per-issue warning dialog.** The solver now runs only when the user is on the Analyze tab, and structural-validity issues surface as a focused dialog instead of being silently swallowed.

### Added
- **`src/lib/analysis-diagnostics.ts`** — new pure module performing cheap structural pre-flight checks: empty model, reaction count, connectivity (union-find over members), and γ=0 sections. Returns a typed `DiagnosticsReport` consumed by the status bar and the new dialog.
- **Analysis Issues dialog** (`src/components/analysis-issues-dialog.tsx`). Auto-opens on Analyze-tab entry when there is at least one error-severity issue. Closable via the `×` button, backdrop click, or `Esc`. Manually re-openable by clicking the status-bar STATUS label. Lists issues sorted errors-first with dedicated messages per issue kind.
- **Pivot tracking in `gaussSolve`.** The solver now identifies *which* DOF is singular and surfaces it via `SolverResult.singularDof`. The diagnostics layer translates it to a node + direction message in the dialog.
- **Selfweight γ=0 inline warning.** A second amber warning is rendered in both the Load Case and Load Combination flyout tools when Selfweight is enabled but some referenced sections have γ ≤ 0. Sibling to the existing "Selfweight is deactivated" warning.
- **Duplicate-member detection** in `runDiagnostics`. Surfaces an amber warning in the Analysis Issues dialog when any two members share the same endpoint pair — defensive guard for templates, future imports, and scripting paths that bypass the user-facing MEMBER tool's existing duplicate check.

### Fixed
- **Roof Howe truss template generated 2 duplicate members per build.** The diagonal loop emitted "diagonals" at the corner panels (i=0 and i=numDiv−1) whose endpoints coincided with the outermost top-chord segments, doubling their stiffness in K and mislabeling a textbook-determinate truss as `INDETERMINATE`. Diagonal loop now spans inner panels only (`i = 1` to `numDiv − 2`); preview renderer mirrors the fix. After: the template ships as `DETERMINATE` for every supported `numDiv` (4, 6, 8, 10, 12) with `m + r = 2j` by construction.
- **`gaussSolve` per-DOF singularity tolerance.** The previous tolerance `1e-12 · max|diag(K)|` scaled to the *largest* diagonal entry of the entire matrix. With wildly inconsistent section properties (e.g. user authors `A = 100 m²` paired with `I = 1e-12 m⁴`), the axial diagonals dominate `maxDiag` and the bending diagonals fall below the threshold even though they're physically nonzero — the solver reported a false instability. The tolerance is now scaled per-DOF against that DOF's own original diagonal magnitude. Real mechanisms still trigger; pure ill-conditioning no longer does.
- **Radius-of-gyration warning in the MATERIAL manual form.** When the user authors `√(I33 / A)` outside the physically reasonable range `0.1 mm – 10 m`, an amber warning surfaces inline: *"A and I33 give an unrealistic radius of gyration √(I/A). The solver may flag false instabilities."* Soft check — does not block save. Catches the authoring error early instead of letting it propagate as a confusing "Instability detected" later.

### Changed
- **Lazy solver execution.** `solveAllCases` is now gated on `activeTab === "Analyze"` in `App.tsx`. Editing in Model/Load tabs no longer triggers solves whose results would never be drawn — entering the Analyze tab functions as the implicit "Analyze" trigger. Edits while on Analyze still re-solve live, preserving the no-button UX inside the tab.
- **Status-bar relabel: `STABILITY` → `STATUS`.** Three states replace the binary STABLE/UNSTABLE: `DETERMINATE` (green), `INDETERMINATE` (amber), `UNSTABLE` (red). The status pill is now a clickable button that opens the issues dialog. Driven by the diagnostics module — accounts for connectivity and solver singularities, not just the `3m + r vs 3j` count formula.
- **Solver failure reasons no longer discarded.** `solveCase` returns the full `SolverResult` (including `reason` and `singularDof` on failure) instead of collapsing failures to `null`. `combineResults` and `pickDisplayedResult` narrow on `.ok` accordingly.
- **`gaussSolve` tolerance.** Replaced the absolute `< 1e-30` pivot threshold with `1e-12 · max|diag(K)|`, catching near-mechanisms that previously slipped through as garbage solutions.
- **`stabilityOf` removed from `model.ts`.** The `3m + r vs 3j` logic now lives inside `runDiagnostics` and is used only to distinguish determinate from indeterminate once error checks have passed.

### Notes
- Core solver math (`localStiffness`, `transformMatrix`, `fixedEndForces`, `condensedTrussElement`, end-force extraction) is unchanged. The only `solver.ts` change is `gaussSolve` itself and the new `singularDof` plumbing.
- The connectivity check uses union-find — O((j + m) · α(j)), microseconds even on large models. The full diagnostics pass is ~1000× cheaper than a single solve.
- **Diagnostic solve in non-Analyze tabs.** Pure-topology diagnostics can't catch every geometric mechanism (isolated nodes whose support doesn't constrain θ, collinear pins, parallel rollers). To keep the STATUS pill honest in every tab, the app runs one solve per edit on a loadless slice of the model. The result is discarded; only the `singularDof` from a failed solve upgrades the diagnostics report. Roughly N× cheaper than the Analyze-tab pipeline (N = enabled cases).

### Documentation
- `docs/USER_GUIDE.md`: Self-Weight section updated to mention the γ=0 inline warning; new "Analysis Status" section explaining the three states + dialog + lazy-solve behavior.
- `docs/ARCHITECTURE.md`: new "Analysis Diagnostics & Lazy Solve" subsection.
- `CLAUDE.md`: status bumped to v1.0.6 with the new diagnostics module under the solver area.

---

## [1.0.5] — 2026-05-24

**Analyze tab UX polish — auto-fit diagrams & deformation with intuitive sliders.**

### Changed
- **Diagram scaling rewritten as peak-normalized auto-fit.** AFD/SFD/BMD scale automatically so the peak value renders at ~1 grid cell on screen, regardless of load magnitude. A 10 kN beam and a 10 MN beam now look identically sized at the default slider position — no more hunting across orders of magnitude.
- **Deformation scaling uses true on-the-line peak.** Auto-fit reference is now the maximum displacement sampled along each member's cubic-Hermite spline (mid-span sag included), not just at end nodes. Fixes a long-standing case where simply-supported beams with ~0 transverse displacement at the nodes caused the normalization to blow up.
- **New slider UX.** Diagram and Deformation sliders are now centered at the auto-fit "sweet spot" (default), with `−` / `+` glyphs at the ends and a snap tick at center. Drag left to suppress, right to exaggerate (up to 4× the sweet spot). Matches the zoom slider's snap-to-center behavior.
- **Honest readout below each slider.** Diagram sliders show `Max. force: …` (peak axial/shear/moment value in the current model). Deformation slider shows `Amplification: ×N` (true factor applied to displacements) — what FEA users expect.
- **Layout consistency.** Renamed all summary sections to just "Summary". Moved the section separator below the slider+readout block (above Member/Node Labels) on the diagram and deformation tools; removed the separator above "Summary" on the reaction tool.

### Notes
- Solver math, sign conventions, and analysis results are unchanged. This release is entirely a display/UX layer.
- Default scale state changed from `10`/`25` to `1`/`1` — first open of an analyzed model now lands on the sweet spot rather than requiring manual adjustment.

---

## [1.0.4] — 2026-05-23

**Load cases, code-preset combinations, and real self-weight body forces — paired with a truss element rewrite that lets self-weight (and any transverse load) flow through trusses correctly.**

### Added
- **Load cases.** Loads carry a `loadCaseId` and can be grouped into named cases (Dead, Live, Wind, Seismic, etc.). New `LoadCase` type with a `kind` field used for combination matching. New LOAD CASE tool with row-level case authoring (`src/tabs/load/tools/load-case-tool.tsx`).
- **Load combinations.** Linear combinations of cases with user-defined factors. New LOAD COMBINATION tool (`src/tabs/load/tools/load-combination-tool.tsx`).
- **Automatic combinations — all nations.** Code-prescribed combination presets generated by matching case `kind` (`src/lib/combinations-presets.ts`):
  - **ASCE 7-16** § 2.3.2 LRFD strength
  - **ASCE 7-22** (same § 2.3.2 LRFD set for this scope)
  - **SNI 1726-2019** (Indonesia)
  - **Eurocode** EN 1990:2002+A1 Eq. 6.10 (simple set) + EN 1998-1 § 3.2.4 seismic
  - **GB 50068-2018** (post-2018 China reform) + GB 50011 seismic
  - **AS/NZS 1170.0:2002** § 4.2.2 (Australia / New Zealand)
  - **BSL/AIJ** Japan (allowable stress design — long-term / short-term)
- **Analyze view selector** (bottom-right of canvas, `src/components/analyze-view-selector.tsx`) — switch the diagram/deformation/reaction display between single-case view and any active combination.
- **Analysis pipeline rewrite** (`src/lib/analysis-pipeline.ts`) — `solveAllCases` solves each enabled case independently; `combineResults` linearly sums case results per combo factors. The solver itself is unchanged.
- **Self-weight as a real load case.** The locked Selfweight LoadCase (previously a no-op placeholder) is now functional: `solveCase("selfweight")` synthesizes a global-Y distributed load per member from `γ · A` (kN/m). Synthetic loads are scoped to the case slice and never appear in `model.loads`. Members with `γ ≤ 0` (or legacy manual sections missing γ) contribute nothing — silent skip. Default: disabled.
- **Self-weight in combos**, free. Because Selfweight has `kind: "Dead"`, any preset Dead-factor term (1.4D, 1.2D, …) automatically includes it once enabled — no manual wiring.
- **I=0 guard** at the material input layer (manual form + advanced-panel override). Static condensation of the new truss element requires `EI > 0`.

### Changed
- **Truss element redefined** as a frame element with M3 releases at both ends, implemented via static condensation in `solver.ts::condensedTrussElement`. End moments are zero by construction at the joints, but the condensed stiffness carries transverse load (including self-weight) between end nodes — real V/M now renders on the SFD/BMD between truss joints. Matches reference software's truss model. Replaces the previous purely-axial truss that silently dropped distributed loads.
- **Stability check** simplified to a single formula `3m + r ≥ 3j`. The pure-truss `m + r ≥ 2j` branch is obsolete because every member is now 3 DOF/end.
- **Member-tool help text** for trusses updated to reflect the new semantics (transmits only axial at joints; carries transverse load locally between end nodes).

### Fixed
- Hover and selection state glitches in the load tab when working with cases.
- Load-case flyover interaction edge cases.
- Load tool UI refinements and button/style consistency across the case/combo flow.

### Documentation
- `docs/USER_GUIDE.md`: new SELF-WEIGHT section (how to enable, where γ comes from, combo interaction, truss behavior); MEMBER section updated for the new truss semantics.
- `docs/ARCHITECTURE.md`: new "Truss Element (v1.0.4+)" and "Self-weight load case" sections.
- `CLAUDE.md`: status bumped to v1.0.4 with a "Selfweight Stitches" architecture entry.

### Notes
- Pure axial-only truss elements no longer exist. Existing models load fine — the new condensed element gives identical joint behavior for axial-only load paths.
- Verified against reference software: Warren truss, 3 m × 3 m bays, 10 kN/m on a top-chord member → M_max = qL²/8 = **11.25 kN·m**, end moments zero, parabolic BMD — matching exactly.
- Self-weight calibration: IWF200 simple beam, L = 6 m → Ry ≈ 0.67 kN per support, M_mid ≈ 1.006 kN·m.

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
