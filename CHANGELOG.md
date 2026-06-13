# Changelog

All notable changes to OpenAnstruk-2D are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.1.1] — 2026-06-13

**Design tab — RC column axial-flexure (P–M interaction) design (ACI 318-14 / SNI 2847:2019).** The SECTION DESIGN tool gains an **Element Type** selector (Beam / Column / Auto), and columns are designed by a full **P–M interaction** capacity surface — five named points A–E plus a continuous neutral-axis sweep, radial demand/capacity ratio, in both As-required and As-checked modes. Validated against the book's Contoh 5-C (600×600, f'c 30, fy 420, 20D25). This pass covers **capacity + interaction**; column **shear** and the **SRPMK `Ash` confinement** table (Contoh 5-D) are a follow-up.

### Added
- **`src/lib/design/column.ts`** — pure interaction engine: `sectionForcesAtC` (per-bar strain compatibility about the geometric centroid, generalising `phiMnBars` to non-zero axial), `buildInteractionCurve` (sweeps `c` to trace both ±M edges → a closed loop, with the five named points A–E), `axialCapacities` (Po, φPo, `Pn,max = 0.80·φPo` tied cap, pure-tension Pnt), and `interactionDC` (radial demand/capacity against the closed φ-polygon). flexure.ts is untouched (its anchors stay byte-stable).
- **`src/lib/design/column-layout.ts`** — `buildColumnBarLayout` (nx × ny perimeter grid, total = 2nx+2ny−4; bar inset = cover + tie + ½db), `representativeColumnBars` (As-required ring with scaled areas), and `checkColumnArrangement` (live ACI: ρg ∈ 1–8% per 10.6.1.1, ≥ 4 bars 25.7.2.1, 25.2.3 clear spacing, cover).
- **Element Type** select in SECTION DESIGN, below Material Class. `auto` resolves per member at run: vertical → column, horizontal → beam, **promoted to column when Pu ≥ 0.1·f'c·Ag**.
- **Column As-checked** — nx × ny grid editor, live perimeter preview (`rc-column-preview.tsx`), detailing-checks card, and an **Advanced Capacity Report** (`column-advanced-report.tsx`) that draws the **section + P–M interaction curve** (nominal + φ loops, both ±M, the A–E points, the flat `Pn,max` cap, and the run's demand markers) with a Tabel 5-19 coordinate table + summary.
- **Column As-required** — bisects the longitudinal ratio ρg ∈ [1%, 8%] on a representative symmetric ring until the worst (P, M) lands on the curve; reports required ρg + Aₛₜ.
- **Demands** — `collectPMPairs` (demands.ts) returns the paired (P, M) at each candidate station, since interaction needs the actual axial+moment acting together (not independently enveloped).
- **Canvas** — column members coloured by radial interaction D/C (`designColorForDC`); a single pill (`D/C · ρ`, or `ρ req` in required mode); new "Interaction D/C" report option.
- **Validation** — `validation/rc_column_verify.mts` (26 Contoh 5-C anchors: Po = 13050 kN, φPn,max = 6786, B/C/D/E coordinates, demand-inside check, and a cross-check that the column engine ≡ `phiMnBars` at pure bending).

### Changed
- **`runDesign()`** resolves beam vs column per member and branches to the column interaction path; the beam axial gate now only yields `axial-exceeded` for an explicitly **forced** beam carrying high axial (auto always promotes such members to columns).
- **`MemberDesignResult`** gained `kind: "beam" | "column"` and an optional `column` result; the report dropdown gained a "Columns" group.

### Notes
- DSM solver and model math untouched — the column engine is a pure consumer of analysis results.
- Tied columns only this pass (`Pn,max = 0.80·φPo`); spiral (0.85), column **shear**/SRPMK `Ash` confinement, and slenderness are deferred.
- Design state remains App-state only (not persisted by Save/Load), same boundary as v1.1.

### Documentation
- `docs/DESIGN_RULES.md`: new column section (§5b) + updated extension/limitation notes.
- `CLAUDE.md`: "RC Column Design (v1.1.1)" subsection.

---

## [1.1.0] — 2026-06-12

**Design tab — RC beam design checks (ACI 318-14 / SNI 2847:2019).** A fourth tab adds reinforced-concrete flexural + shear design for rectangular beams across Ordinary / Intermediate / Special moment frames (OMF / IMF / SMF). It applies to every member with a concrete rectangular section (f'c > 0) regardless of orientation — a 2D plane frame has no torsion DOF, so pure M + V design is exact. The full engineering narrative, with every governing clause, lives in the new **[docs/DESIGN_RULES.md](docs/DESIGN_RULES.md)**.

### Added
- **`src/lib/design/` pure-domain engine** (no React): `types`, `rebar` (D10–D32 catalogue), `flexure` (β₁, As,min, Whitney `requiredAs`, strain-compatibility `phiMnProvided`/`phiMnBars`, φ ramp), `shear` (Vc, φVmax, Av/s, spacing caps, stirrup suggestion), `demands` (analytic zone extremes, envelope, frame minimums, gravity combo), `bar-layout` (shared bar geometry + ACI detailing checks), and `run-design` (orchestrator).
- **Two tools** (`src/tabs/design/tools/`): **DESIGN CRITERIA** (code, frame type, fy/fyt/Es, φt/φv/φc, λ, stirrup legs) and **SECTION DESIGN** (material class, section picker, As-required / As-checked mode, per-section rebar with Support/Midspan arrangements, and a live SVG cross-section preview).
- **Two design modes.** *As required* computes required As (top/bottom, Whitney) and Av/s per zone; *As checked* evaluates the user's bars by **per-bar strain compatibility** — side/skin bars **included** (permitted by 9.7.2.3), displaced-concrete correction, εt at the extreme tension bar, φ ramped 0.65→0.9 (21.2.2).
- **Demands** — exact analytic per-zone extremes (polynomial roots, no sampling) enveloped across enabled combinations, with SMF (18.6.3.2) / IMF (18.4.2.2) moment minimums and a synthesized 1.2D+1.0L gravity combo for capacity-design shear.
- **Capacity-design shear** — OMF = envelope Vu; IMF = Ve from Mn + Vg; SMF = Ve from Mpr (1.25fy) + Vg with Vc = 0 in hinge zones.
- **Bar layout & layering** (`bar-layout.ts`) — single source of truth shared by the preview and the flexural solver. Auto-overflow into a second layer at a hard-coded 50 mm clear (≥ 25 mm of 25.2.2, for 135°-hook clearance), vertically aligned (25.2.2), max 2 layers; a lone overflow bar is promoted to two at the outer positions. Side bars distributed evenly between the innermost top/bottom rows. Bar-count inputs clamp to the geometric maximum.
- **Live ACI detailing checks** under the preview (As-checked): longitudinal (`checkArrangement`) — 25.2.1 fit/clear spacing, 24.3.2 crack-control spacing, 20.6.1.3.1 cover ≥ 40, 18.6.3.1 (SMF ≥ 2 bars), 9.7.2.3 skin reinforcement for h > 900; transverse (`checkTransverse`) — max spacing per frame/zone, Av/s ≥ Av,min/s (9.6.3.3), SMF hx ≤ 350 (18.6.4.2), stirrup ≥ D10 (25.7.1), first-hoop ≤ 50 mm advisory.
- **Run-time spacing fixes** — `governingSpacingMax` unifies the spacing caps: SMF hinge (18.6.4.4), IMF hinge min(d/4, 8db, 24db_hoop, 300) (18.4.2.5), and the general 9.7.6.2.2 cap tightening from min(d/2, 600) to min(d/4, 300) when Vs = Vu/φ − Vc exceeds 0.33√f'c·bw·d.
- **Canvas** — members recoloured by worst flexural D/C (5-band `designColorForDC`); two rotated pill labels per designed member (flexure +local-2, shear −local-2); a colour legend when results exist; a floating "Run Design" button (Design tab only).
- **Validation** — `validation/rc_beam_verify.mjs` (25 SMF anchors: As = 2224 mm², Mpr = 552.9 kN·m, Ve = 234.03 kN, Av/s → D10@100) and `validation/strain_compat_check.mts` (16 strain-compat / layering / spacing assertions).
- **`docs/DESIGN_RULES.md`** — authoritative design-logic reference, structured so steel members and new section shapes/columns slot in as material/shape strategies.

### Changed
- **`runDesign()` solves its own cases** (`solveAllCases` + `combineResults`) rather than reusing the Analyze tab's lazy memo, so design works from any tab. Results are cleared by an invalidation effect on any change to model / load cases / combinations / criteria / section inputs / shear-deformation.
- **App state** gained `designCriteria`, `sectionDesignInputs`, `designSelectedSectionId`, `designResult` — App-state only, not part of `StructureModel`, not persisted by Save/Load (same boundary as load cases/combinations).

### Notes
- The DSM solver and all model math are untouched — the design engine is a pure consumer of analysis results.
- Vc uses the code coefficient 0.17√f'c; the reference's worked example used 1/6 (~2 % difference).
- OMF/IMF share the SMF-validated engine but are not separately anchored to a published example. Columns, steel members, and non-rectangular sections are deferred — the engine is structured for them (see `docs/DESIGN_RULES.md` §12).

### Documentation
- **`docs/DESIGN_RULES.md`**: new — full design logic + clause index + extension guide.
- `CLAUDE.md`: "Design Tab — RC Beam Design Checks (v1.1.0)" section.
- `CHANGELOG.md`: this entry.

---

## [1.0.11] — 2026-06-09

**Undo / Redo.** A single history stack lets users reverse and replay edits to the model — nodes, members, supports, sections, and loads (loads live inside `model`, so one stack covers everything). Two buttons sit directly below the zoom slider, with Ctrl+Z / Ctrl+Y shortcuts. Both are available only on the **Model and Load tabs** (the read-only Analyze tab has no editing history). History is reference-based: snapshots are pointers to past immutable `model` objects, not clones, so the memory cost is negligible even at the 20-deep cap.

### Added
- **`useModelHistory` hook** (`src/hooks/use-model-history.ts`) — observes `model` via an effect and pushes the previous state onto an undo stack on each change (capped at 20). Exposes `{ undo, redo, canUndo, canRedo, resetHistory }`. Two cases are guarded: changes caused by undo/redo itself (identity check), and the rapid intermediate updates of an on-screen node drag (coalesced into one entry via `draggingNodeId`, so a whole drag is a single undo).
- **Undo / Redo buttons** in `structural-canvas.tsx`, in a card directly below the zoom overlay (rendered only on the Model/Load tabs). Navy accent, hover scale-up + bg tint, active press; greyed and unclickable when the corresponding stack is empty. Hover tooltips read "Undo (Ctrl+Z)" / "Redo (Ctrl+Y)" — no on-screen legend.
- **Keyboard shortcuts** (`App.tsx`) — Ctrl/Cmd+Z = undo, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z = redo, registered only while on the Model/Load tabs. The listener ignores form fields (`input`/`textarea`/`contentEditable`) so native text-undo still works while typing.

### Changed
- **`StructuralCanvas`** gained `onUndo` / `onRedo` / `canUndo` / `canRedo` props.
- The five whole-model swap handlers (`handleNewFile`, `handleLoadFile`, `handleTemplateLoad`, `handleExampleConfirm`, `handleTemplateConfirm`) call `resetHistory()` after swapping, so undo never crosses a document boundary.

### Notes
- The solver and all model math are untouched — this is a state/UI layer only. `analysisResult` is not snapshotted; it recomputes lazily on the Analyze tab after an undo.
- History does not persist across reload, and the on-screen shortcut legend is intentionally out of scope.

### Documentation
- `CHANGELOG.md`: this entry.

---

## [1.0.10] — 2026-06-09

**File I/O — JSON save & load.** The File menu can now persist a model to disk and read it back, so work survives closing the tab. JSON is the native, lossless format for `StructureModel` (no CSV — it can't round-trip nested section/derived data). "New Canvas" is renamed "New File" for menu consistency. Undo/redo is a separate follow-up.

### Added
- **Save File** in the File menu — serializes the current `StructureModel` to pretty-printed JSON and downloads it as `openanstruk-structure-<YYYYMMDD-HHMM>.json` via a `Blob` + temporary anchor. Works on an empty canvas.
- **Load File** in the File menu — opens a `.json` picker, reads the file, parses and shape-guards it, then swaps it into the app using the same reset path as New File. On a parse error or invalid/foreign file, an alert is shown and app state is left untouched.
- **`seedIdCounter(model)`** in `lib/model.ts` — seeds the shared ID counter to the maximum numeric suffix across all loaded node/member/load/section keys, so entities created after a load never collide with loaded ones. Used by Load File instead of `resetIdCounter()`.
- **`isStructureModel(x)`** in `lib/model.ts` — lightweight runtime shape guard for untrusted file contents; requires the five entity records and a non-empty `sections` map.

### Changed
- **"New Canvas" → "New File"** label in the File-menu dropdown (`nav-bar.tsx`). The handler (`onNewFile`) is unchanged.
- **`NavBar`** gained `onSave` / `onLoad` props, wired in `App.tsx` to the new `handleSaveFile` / `handleLoadFile` callbacks.

### Notes
- The solver and all model math are untouched — this is purely a persistence/UI layer.
- Load reuses the existing model-swap reset (clear selection/tool/frame-start, switch to Model tab, `setActiveSection(firstSectionId(...))`), matching the behavior of New File and the template/example paths.
- CSV (any direction), keyboard shortcuts, File System Access API (save-in-place), and autosave are intentionally out of scope.

### Documentation
- `CHANGELOG.md`: this entry.

---

## [1.0.9] — 2026-06-07

**Shear deformation (Timoshenko beam).** An opt-in toggle adds shear flexibility to every element's bending stiffness. Off by default and byte-identical to v1.0.8 when off; when on, deep/short members and shear-dominated frames deflect more (and, for indeterminate structures, internal forces redistribute) per Timoshenko theory. Applies to both frame and truss members. Verified against SAP2000 on Example 5 (asymmetric rafter frame, 300×500 fc25 section) — reactions, axial, and moment all match to displayed precision.

### Added
- **"Enable Shear Deformation" toggle** in the status-bar Settings panel, directly above "Adaptive View", defaulting **off**. Threaded `App.tsx → StatusBar → SettingsPanel`; flipping it live re-solves all load cases.
- **Read-only "Shear Modulus, G" row** in the manual section form, directly below Poisson's ratio. Computed live as `G = E / (2(1+ν))` from the current E and ν fields and displayed in MPa. Display-only — not stored, validated, or parsed; the solver derives G the same way. The editable `Aκ2` (shear area) input is unchanged.
- **`validation/shear_deformation_example5.md`** + **`shear_deformation_example5_verify.mjs`** — the SAP2000 cross-check case and its standalone regeneration script.

### Changed
- **`localStiffness(EA, EI, L, GAs = 0)`** now applies the Timoshenko shear-flexibility factor `Φ = 12·EI/(GAs·L²)`: the transverse/rotational bending block is scaled by `1/(1+Φ)`, with rotational diagonal `(4+Φ)·EI/(L(1+Φ))` and carry-over `(2−Φ)·EI/(L(1+Φ))`. Axial terms unchanged. `GAs = 0 ⇒ Φ = 0`, which reduces algebraically to the prior Euler–Bernoulli matrix — so the shear-off path is byte-stable.
- **`condensedTrussElement(..., GAs = 0)`** forwards `GAs` to its internal `localStiffness`. Static condensation of θᵢ, θⱼ is unchanged, so trusses honor the toggle while still transmitting only axial at the joints.
- **`analyze(model, opts?: { shearDeformation?: boolean })`** gained a per-member `GAs` resolver, applied identically at the assembly and force-recovery sites (the same K must be used for both). `As = Aκ2 · 1e-6` (mm²→m²); `G = (sec.derived?.G ?? shearModulus(E, ν ?? 0.3)) · 1000` (MPa→kN/m²); `GAs = G · As` (kN). A missing or ≤ 0 `Aκ2` yields `GAs = 0` — that member silently falls back to Euler, mirroring the existing `γ ≤ 0` self-weight skip.
- **`solveCase` / `solveAllCases`** thread an `opts` argument down into every `analyze` call (both the self-weight and normal branches). Self-weight synthesis itself is unchanged.

### Notes
- `fixedEndForces`, `transformMatrix`, end-force sign extraction, `memberInternalForces`, and reaction recovery are untouched. Diagrams remain equilibrium-based, so SFD/BMD/AFD shapes stay correct; only the displacement field (and, for indeterminate models, the force distribution) responds to the toggle.
- For determinate structures, enabling shear changes displacement magnitudes only — reactions and diagrams are unchanged.

### Documentation
- `CLAUDE.md`: new "Shear Deformation (v1.0.9)" section; solver "Sign Conventions" / stiffness notes mention the optional `GAs` parameter and the Euler-reduction guarantee.
- `docs/ARCHITECTURE.md`: matching note on the toggle and the Timoshenko stiffness path.
- `CHANGELOG.md`: this entry.

---

## [1.0.8] — 2026-05-26

**Visibility settings.** A consolidated set of overlay toggles in the status-bar Settings panel: node IDs, member IDs, local axes, and section labels. The Analyze-tab flyouts no longer carry per-tool "show label" switches — the new global toggles cover all three tabs. IDs reflect the model's actual stored identifiers, and a fresh canvas / template / example restarts numbering at `n1` / `m1`.

### Added
- **Show Node IDs / Show Member IDs toggles** in the Settings popover (status bar → Settings), defaulting off. Render small pill labels at each node (bumped above) and each member midpoint (bumped opposite of the section label, rotated to follow diagonals). Pills scale with `s = adaptiveView ? 1/zoom : 1`, matching the existing label adaptive-size convention.
- **Show Local Axes toggle**. Renders a per-member 1-2 axis gizmo at each member midpoint: red `1` arrow along local-1 (i→j), green `2` arrow along local-2 (in-plane perpendicular), and a small blue ⊙ glyph for local-3 (out of screen). Adaptive-sized; tunable `ARROW_LEN`, `HEAD`, `LABEL_OFF`, `LINE_WIDTH`, `MID_OFFSET` constants live at the top of `drawLocalAxes`.
- **Show Section Labels toggle**, defaulting on. Section names on members now render across Model / Load / Analyze tabs instead of being hard-gated to Model.
- **Pill rotation parameter** on `drawMemberIdTag(ctx, sx, sy, memberId, angle?, s?)` — pill text follows the member's screen-space angle (normalized to `[-π/2, π/2]` to keep text upright), so diagonal members get diagonal pills aligned with the member axis.
- **`resetIdCounter()`** is now part of the public model API (was previously test-only). Called at the start of `handleNewFile`, `handleTemplateLoad`, each template modal's build function (`buildBeamModel`, `buildFrameModel`, `buildTrussModel`, `buildRoofHoweTrussModel`, `buildRoofFinkTrussModel`), and the Examples-modal confirm path. Result: a fresh canvas or template load restarts node/member IDs at `n1` / `m1`.

### Changed
- **Section-label gate.** `drawMembers` no longer hardcodes `activeTab === "Model"` for the section name; it reads the new `showSectionLabels` flag, threaded through `App.tsx → StatusBar → GridUnitsPanel → StructuralCanvas`. Visible in all three tabs by default.
- **ID-pill helpers (`drawNodeIdTag`, `drawMemberIdTag`) gained an `s` scale parameter** — font size, padding, border width, corner radius all multiply by `s` so pills stay visually consistent with the section label and dimension labels at any zoom.
- **Display format for IDs.** Pills render the raw internal ID verbatim (`n3`, `m5`) instead of the previous `"N" + nodeId.replace(/^\D+/, "")` and `memberId.toUpperCase()` transforms. The Analyze-tab summary lists (reaction, diagram, deformation) match. Storage IDs remain lowercase as before.
- **JSDoc on `resetIdCounter`** relaxed from "test setup / teardown only" to "call before building a fresh model".

### Removed
- **Per-tool label toggles in the Analyze flyouts** (`Show Node Labels` on reaction-tool, `Show Member Labels` on diagram-tool, `Show Node Labels` on deformation-tool). Their state (`showReactionNodeLabels`, `showDiagramMemberLabels`, `showDeformNodeLabels`), corresponding props through `flyout-panel.tsx`, and the canvas branches that consumed them are deleted. The new global `Show Node IDs` / `Show Member IDs` toggles cover the same need across all tabs. Value labels (Rx/Ry/Mz, V/M/N, Δ) are always rendered when the analyze tool is active.

### Fixed
- **Member-ID pill orientation on diagonal members.** Previously horizontal, now rotates to follow the member axis with text kept upright via the same `[-π/2, π/2]` normalization the section label uses. Pill sits perpendicular to the member on the opposite side from the section label, so the two never overlap.

### Notes
- Solver, reactions, displacements, AFD/SFD/BMD values are byte-identical to v1.0.7. This release is overlay-only.
- The internal ID *is* the identity used by the solver — there is no separate "label vs ID" layer. Resetting the counter on model swaps lets the user-facing IDs restart cleanly without any change to how members reference nodes.

### Documentation
- `CLAUDE.md`: "Sign Conventions" section gained an explicit **Global frame** block (+X, +Y, +Z) and a **Local ↔ global mapping** table for horizontal / vertical / diagonal members + a note on the screen-space Y-flip rule.
- `docs/ARCHITECTURE.md`: matching updates — global frame statement, mapping table, and a one-line mention of the new Show Local Axes setting.
- `CHANGELOG.md`: this entry.

---

## [1.0.7] — 2026-05-26

**Adaptive selfweight on member.** The AFD now reflects the linear axial variation caused by gravity components along inclined members. Frame columns and truss diagonals carrying self-weight along their local-1 axis previously rendered as a constant axial band; they now show the true linear ramp. Reaction values, SFD, and BMD are byte-identical to v1.0.6.

### Added
- **Axial distributed-load channel in `MemberEndForces`** — `qx1, qx2: number` alongside the existing transverse `q1, q2`. Carries the local-1 (axial) component of any distributed load through assembly, recovery, combination, and envelope paths.
- **Axial term in `memberInternalForces`** — `N(x) = N1 − qx1·x − (qx2 − qx1)·x²/(2L)`. AFD interior values are no longer assumed constant.
- **Mirrored trapezoidal AFD rendering.** `drawAxialDiagram` now samples N(x) at 60 points per member and fills a symmetric band on both sides of the member centerline. Avoids the SAP2000-style left/right side ambiguity — the same diagram reads the same regardless of member i→j ordering. Auto-fit normalization uses the per-member peak |N| across all samples, not just `N1`.
- **i/j stacked label for varying-N truss members.** When `|N1 − N2| > 0.01 kN`, truss-member AFD labels render as two stacked lines (`i = …` / `j = …`) parallel to the member, offset past the diagram edge. Constant-N truss members keep the single centered label. Frame-member labels unchanged (end labels + interior peak).

### Changed
- **Axial fixed-end forces in `fixedEndForces`.** Indices `[0]` and `[3]` of the local FEF vector now carry the consistent trapezoidal axial entries `L·(2·qx1 + qx2)/6` and `L·(qx1 + 2·qx2)/6`. For uniform `qx` (the selfweight case), both reduce to `qx·L/2` — the same total as the prior 50/50 lumping, but now expressed in the local FEF so `f = K·d_loc − FEF` reproduces the full element-level reaction at each end instead of half of it.
- **`condensedTrussElement` signature.** Forwards `qx1, qx2` to `fixedEndForces`. Static condensation acts only on moment rows (s = [2, 5]); axial entries (r = [0, 3]) pass through unchanged.
- **Assembly and recovery call sites.** Both the assembly loop and the recovery loop pass `qx1, qx2` into `fixedEndForces` / `condensedTrussElement` so FEF pairing on recovery (`f − FEF`) is consistent.
- **AFD label placement.** Single-label truss case now offsets by `|N · BASE| + 10 px` (was `|N · BASE / 2| + 14 px`) so the label clears the actual mirrored-fill edge at any `diagramScale` instead of drifting into the fill as scale increases.

### Removed
- **Global axial-load lumping block in assembly.** The prior `F[3*ia] += axialAtA*c; F[3*ia+1] += axialAtA*s …` path (which lumped axial distributed loads directly into global F at the nodes) is deleted. The new axial-FEF entries assembled via `F += Tᵀ · FEF_local` deliver the same total nodal force globally (the 50/50 split for uniform `qx` matches the prior lumping numerically) and additionally make element-level recovery produce the correct continuous `N(x)`.

### Fixed
- **Frame member under axial body force showed constant N at half the true magnitude.** Template3 portal columns under selfweight previously rendered the AFD as a constant band at half the true integrated column weight. With the axial FEF properly routed through `f = K·d − FEF`, the base value now reads the full integrated weight (column own weight + transferred reaction from the beam above), tapering linearly to the small joint-transfer value at the top — matching the textbook fixed-base column-under-self-weight result. The fix is the same mechanism that already produced correct transverse end forces; we extended the local FEF coverage to include the axial entry that was previously zero.

### Notes
- Reactions, displacements, shear forces, and bending moments are byte-identical to v1.0.6 for every load configuration. The change is scoped to the axial channel.
- For Warren-class truss members carrying axial self-weight (inclined members under gravity), member-end values vary linearly; small residuals against SAP2000 remain under investigation. Reactions and global equilibrium match SAP exactly. Investigation context is preserved locally — not committed.
- `solveCase("selfweight")` synthesis (`gamma · A` → global-Y distributed load) is unchanged; the fix is downstream in solver assembly/recovery.

### Documentation
- `docs/ARCHITECTURE.md`: solver section updated to describe the new axial-FEF entries and `N(x)` interpolation; AFD-rendering section updated to mention the mirrored band and i/j stacked labels.
- `CHANGELOG.md`: this entry.

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
- **Truss element redefined** as a frame element with M3 releases at both ends, implemented via static condensation in `solver.ts::condensedTrussElement`. End moments are zero by construction at the joints, but the condensed stiffness carries transverse load (including self-weight) between end nodes — real V/M now renders on the SFD/BMD between truss joints. Matches SAP2000's truss model. Replaces the previous purely-axial truss that silently dropped distributed loads.
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
- Verified against SAP2000: Warren truss, 3 m × 3 m bays, 10 kN/m on a top-chord member → M_max = qL²/8 = **11.25 kN·m**, end moments zero, parabolic BMD — matching exactly.
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
