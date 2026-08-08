# Architecture

OpenAnstruk-2D is a browser-based 2D structural analysis application. This document explains how the codebase is organized and how the major pieces fit together — intended for contributors who want to understand the system before making changes.

## Overview

The app is a single-page React application with no backend. Everything — modeling, loading, and analysis — runs entirely in the browser. There is no server, no database, and no build-time data fetching.

The workflow follows four sequential steps:

```
Model  →  Load  →  Analyze  →  Design
```

Each step maps to a tab in the UI. The user builds a structure, assigns loads, runs analysis to view results, then checks RC beam sections (flexure + shear) on the Design tab.

---

## Project Layout

The codebase follows a **tab-sliced** structure: each of the four major areas (`lib`, `canvas`, `tabs`, `components`) owns one concern. Adding a new tool means adding one file under the right `tabs/` subfolder.

```
OpenAnstruk-2D/
├── README.md
├── html/                              # Static HTML entry points
│   ├── index.html                     # Landing page (standalone, no Vite)
│   └── app.html                       # React app shell (loads /src/main.tsx via Vite)
├── public/                            # Static assets copied as-is to dist/
│   ├── demo/                          # Demo screenshots used on landing page
│   ├── _headers                       # Netlify/CDN response headers
│   ├── _redirects                     # Netlify SPA redirect rules
│   └── OpenAnstruk-*.svg              # Brand logo/label SVGs
├── src/                               # All React/TS source
│   ├── App.tsx                        # Root component — top-level state, click handlers, modal wiring
│   ├── main.tsx                       # Vite entry, mounts <App />
│   ├── globals.css                    # Tailwind v4 + @theme design tokens
│   │
│   ├── lib/                           # Pure domain logic (no React imports)
│   │   ├── model.ts                   # StructureModel types + immutable update helpers
│   │   ├── solver.ts                  # DSM finite element solver
│   │   ├── geometry.ts                # Coordinate transforms, hit-testing, snap
│   │   ├── diagram-utils.ts           # local2World + splitByZeroCrossings
│   │   ├── constants.ts               # Shared magic numbers, colors, formatValue()
│   │   ├── units.ts                   # UnitSettings + display/parse helpers
│   │   ├── flyout-panel-colors.ts     # FLYOUT_PANEL_COLORS palette
│   │   ├── svg-renderer.ts            # renderModelToSVG() for example thumbnails
│   │   ├── utils.ts                   # shadcn cn()
│   │   ├── sections/                  # Section/material domain (pure, no React)
│   │   │   ├── compute.ts             # buildParametricSection, computeSectionFromParametric
│   │   │   ├── materials/             # types, concrete, steel, index
│   │   │   └── shapes/                # types + rect, circle, iwf, tee, angle, chs, rhs
│   │   └── design/                    # Design engine (pure) — see docs/DESIGN_{RULES,RC,STEEL}.md
│   │       ├── core/                  # material-agnostic: run-design, demands, designability, criteria, types
│   │       ├── rc/                    # RC strategy: criteria, types, strategy
│   │       │   ├── shared/            #   code-agnostic geometry (rebar, bar-geometry, column-grid)
│   │       │   └── codes/<code>/      #   per-code math (rules, beam, column, report) — aci318-25, sni2847-19
│   │       └── steel/                 # steel strategy (AISC 360/341-16 / SNI 1729:2020)
│   │           ├── member-role.ts     #   inferSteelRole — beam/column/brace
│   │           ├── rules.ts           #   steelGeom + Table B4.1a/B4.1b classification
│   │           ├── compression.ts     #   E3 / E4 / E7 / D2
│   │           ├── flexure.ts         #   F2, F3, F7, F8, F9 (tee), F10 (angle)
│   │           ├── shear.ts           #   G2 / G3 / G4 / G5
│   │           ├── interaction.ts     #   H1-1a/b, H2-1 (no H1.3)
│   │           ├── seismic.ts         #   AISC 341 D1.1 / D1.2 / E3.4a SCWB
│   │           ├── section-props.ts   #   Section → clause inputs (shared with the UI decks)
│   │           └── strategy.ts        #   designMemberSteel — station sweep + envelope
│   │
│   ├── canvas/                        # Canvas shell + tab-agnostic draw primitives
│   │   ├── structural-canvas.tsx      # Viewport, pan/zoom, event routing, draw() loop
│   │   ├── id-tags.ts                 # drawNodeIdTag, drawMemberIdTag
│   │   ├── support-glyph.ts           # drawSupportGlyph, hitTestSupportGlyph
│   │   └── box-selection.ts           # computeBoxSelection / WithNodes / Loads
│   │
│   ├── tabs/                          # Per-tab vertical slices
│   │   ├── model/tools/               # select, delete, move-node, node, member, support + material/
│   │   ├── load/tools/                # point-load, dist-load, modify-load, delete-load
│   │   ├── analyze/tools/             # select, reaction, diagram, deformation
│   │   └── design/tools/              # design-criteria + rc/ (rc-design-tool, beam/, column/) + steel/
│   │
│   ├── components/                    # Shared, tab-agnostic UI
│   │   ├── nav-bar.tsx                # Tab switcher + file/template menus
│   │   ├── tool-sidebar.tsx           # Per-tab tool palette; exports TabType, ToolType
│   │   ├── flyout-panel.tsx           # Thin router (props interface + FlyoutContent switch)
│   │   ├── flyout-shared.tsx          # Simple flat SectionSelect (used by Model-tab tools)
│   │   ├── status-bar.tsx             # Bottom status bar
│   │   ├── settings-panel.tsx         # Settings panel: units, grid, view toggles
│   │   ├── theme-provider.tsx         # shadcn dark/light theme wrapper
│   │   └── ui/                        # shadcn primitives + project atoms
│   │       ├── numeric-input.tsx      # Controlled numeric input
│   │       ├── support-icons.tsx      # pinIcon, rollerIcon, fixedIcon
│   │       └── …                      # button, dialog, input, label, select, …
│   │
│   ├── hooks/
│   │   ├── use-toast.ts
│   │   ├── use-mobile.ts
│   │   └── use-model-history.ts          # Undo/redo: single reference-based model stack
│   └── templates/
│       ├── examples.ts                # 5 static example builders (template1–5)
│       ├── examples-data.ts           # Metadata + SVG illustrations
│       ├── examples-modal.tsx
│       ├── beam-template-modal.tsx    # Parametric multi-span beam
│       ├── frame-template-modal.tsx   # Parametric portal frame
│       └── truss-template-modal.tsx   # Parametric truss
│
├── config/                            # Build tooling (isolated from project root)
│   ├── vite.config.ts
│   ├── eslint.config.js
│   └── tsconfig.json
├── docs/
│   ├── ARCHITECTURE.md                # This file
│   ├── DESIGN_RULES.md                # Design core: designability, demands, orchestration
│   ├── DESIGN_RC.md                   # RC clause math (ACI 318-25 / SNI 2847:2019)
│   ├── DESIGN_STEEL.md                # Steel clause math (AISC 360-16 / SNI 1729:2020)
│   ├── CONTRIBUTING.md
│   └── USER_GUIDE.md
├── tsconfig.json                      # Root tsconfig (references config/tsconfig.json)
├── package.json
├── package-lock.json
├── REFACTOR_PLAN.md                   # Tab-structure refactor plan + smoke matrix
├── LICENSE                            # MIT
```

### Why four top-level src/ folders?

| Folder | Rule | Cannot import from |
|--------|------|--------------------|
| `lib/` | Pure TypeScript domain. No React. | `canvas/`, `tabs/`, `components/` |
| `canvas/` | Canvas shell + shared draw primitives. | `tabs/` |
| `tabs/` | Per-tab vertical slices (tools = sidebar + flyout content + tab-specific draws). | `canvas/structural-canvas.tsx` |
| `components/` | Tab-agnostic shared UI (nav, status bar, flyout shell, ui/ primitives). | `tabs/` |

This rule keeps domain code testable in isolation (nothing in `lib/` depends on React), and prevents tabs from depending on each other.

---

## State Management

All state is owned by `App.tsx` and passed down via props. There is no Context, Redux, or Zustand.

The central piece of state is `model: StructureModel` — a plain immutable object that is the single source of truth for the entire structure. Every user action that changes the structure produces a new model object via `setModel(...)`.

Other important state buckets in `App.tsx`:
- **Tab/tool**: `activeTab`, `activeTool`, `pendingFrameStart`
- **Selection**: `selection` (nodes/members/supports), `selectedLoadId`, `selectedLoadIds`
- **Tool settings**: `activeSection`, `activeMemberType`, `activeSupportType`, move-node state
- **Load input**: `activePtInputMode`, `activeDistMode`, `activeDistType`, and the magnitude fields
- **View**: `unitSettings`, `cursorX/Y`, `showDimensions`, `snapToGrid`, `snapToNode`, `adaptiveView`
- **Analyze**: `analysisResult`, `diagramScale`, `invertSFD`, `invertBMD`, `deformationScale`, label toggles
- **Modals**: `templateModal`, `showExamplesModal`, `showMobileModal`
- **Hover**: `hoveredNodeId`, `hoveredMemberId`, `hoveredLoadId`

### Data Flow

```
User interaction (canvas click / flyout input)
        ↓
handler in App.tsx (handleCanvasClick / tool-specific setter)
        ↓
setModel(newModel)              ← immutable update
        ↓
StructuralCanvas re-renders     ← draws updated structure
        ↓
analyze(model)                  ← runs on every model change when Analyze tab is active
        ↓
setAnalysisResult(result)
        ↓
StructuralCanvas re-renders     ← draws diagrams
```

### Flyout routing

`flyout-panel.tsx` is a thin router. It owns:
- The `FlyoutPanelProps` interface (the superset of every tool's needed props)
- The header (title + close button)
- A `FlyoutContent` switch on `(activeTab, activeTool)` that renders the right tool content component from `src/tabs/{tab}/tools/`

Each tool file declares its own narrow prop type. The router passes through what each tool needs from the superset.

---

## Data Model (`src/lib/model.ts`)

The structure is represented as a flat record-based graph:

```typescript
StructureModel {
  nodes:    Record<NodeId, ModelNode>     // {id, x, y} in metres
  members:  Record<MemberId, Member>      // {id, a, b, section, memberType?}
  supports: Record<NodeId, Support>       // {nodeId, type: "pin"|"roller"|"fixed"}
  sections: Record<SectionId, Section>    // parametric + manual sections
  loads:    Record<LoadId, Load>          // PointLoad | DistributedLoad
}
```

**Key design decisions:**
- IDs are string-keyed monotonic counters (`"n1"`, `"m1"`, `"l1"`, `"s1"`, …). They never reset during a session.
- One load per node (point loads), one load per member (distributed loads) — enforced by the UI.
- Members have an optional `memberType`: `"frame"` (default; full beam-column with moment stiffness) or `"truss"` (SAP2000-style — frame element with M3 releases at both ends; carries transverse load locally between its end nodes but transmits only axial force at the joints). See the Solver section for details.
- `PointLoad` stores `{fx, fy}` global components in kN. The flyout supports both direct component input and angular input (magnitude + angle) — conversion happens in the UI layer.
- `DistributedLoad` supports two modes: `"local-axis"` (default — `wStart`/`wEnd` act in the +local-2 direction, where local-2 = i→j unit vector rotated +90° CCW) and `"global-axis"` (X/Y world components).
- `Section` supports two authoring modes: `manual` (E, I, A entered directly) and `parametric` (materialClass + shape + dimensions, computed via `lib/sections/compute.ts`).

---

## Section / Material Domain (`src/lib/sections/`)

The section catalogue and parametric computation live in `lib/sections/` (pure TypeScript, no React):

- `materials/` — material catalogue. `concrete.ts` and `steel.ts` define defaults; `index.ts` exports `MATERIALS` map plus `materialDef` / `shearModulus` helpers.
- `shapes/` — geometric shapes. Each shape (`rect`, `circle`, `iwf`, `tee`, `angle`, `chs`, `rhs`) exports a `ShapeDef` with `defaults`, `validate`, and `compute(dims) → SectionProperties`. `index.ts` exports `SHAPES` map + `shapeDef` helper.
- `compute.ts` — `buildParametricSection({id, name, materialClass, shape, dims, strength})` produces a complete `Section` with `derived` fields (E, G, A, I33, I22, S33b/t, S22L/R, Z33, Z22, r33, r22, yBar). `computeSectionFromParametric` is used by the parametric form.

The React UI for authoring sections lives separately in `src/tabs/model/tools/material/`.

---

## Solver (`src/lib/solver.ts`)

The solver implements the **Direct Stiffness Method (DSM)** for 2D frame/truss elements.

### Steps

1. **Assembly** — Build global stiffness matrix `K` and force vector `F` by summing element contributions. Distributed loads are converted to fixed-end forces (FEF) in the assembly phase.
2. **Boundary conditions** — Constrained DOFs are zeroed out (zero-row/column method).
3. **Solve** — `K·d = F` solved for nodal displacements `d`.
4. **Recovery** — Member end forces extracted from element stiffness and `d`. Internal force distributions interpolated along each member.

### Sign Conventions (Theory-Pure)

**Global frame:** +X rightward, +Y upward (structural Y-up; canvas flips to screen Y-down at render time), +Z out of the screen (right-hand rule). Stored coordinates are world metres.

One rule for every member: local-1 = i→j unit vector `(c, s) = (dx/L, dy/L)`; local-2 = local-1 rotated **+90° CCW** = `(-s, c)`; local-3 = +Z (always coincides with global +Z in 2D). No normalization, no quadrant flips, no special cases for vertical members.

**Local ↔ global mapping** (member ordering matters — swapping a/b rotates the 1-2 frame by 180°):

| Member ordering | Local-1 | Local-2 | Local-3 |
|-----------------|---------|---------|---------|
| Horizontal, a left → b right | +X | +Y | +Z |
| Horizontal, a right → b left | −X | −Y | +Z |
| Vertical,   a bottom → b top | +Y | −X | +Z |
| Vertical,   a top → b bottom | −Y | +X | +Z |
| Diagonal up-right (45°)      | (+X+Y)/√2 | (−X+Y)/√2 | +Z |

The settings panel exposes a **Show Local Axes** toggle that draws a per-member 1-2 gizmo (red `1` along the member, green `2` perpendicular, blue ⊙ for the out-of-screen local-3) at each member midpoint.

| Quantity | Positive direction |
|----------|--------------------|
| Axial N  | Tension |
| Shear V  | Force on +face in **+local-2** direction (right-hand rule) |
| Moment M | Sagging — CCW about +local-3 on +face; tension on **−local-2** side |
| Rx reaction | Support pushes structure rightward |
| Ry reaction | Support pushes structure upward |
| Mz reaction | Support applies CCW moment to structure |

### Distributed Load (local-axis mode)

`wStart`/`wEnd` are taken as the perpendicular component along **+local-2**, with no quadrant flip. The same `q1, q2` values are used by both the fixed-end-force formula (assembly) and the internal-force interpolation (recovery), so end values and the curve between them stay consistent.

### Distributed Load — axial component (v1.0.7+)

For distributed loads authored in **global-axis** mode, the projection onto each member's local-1 axis produces an axial intensity `qx1, qx2` (kN/m). This is the channel through which self-weight gravity reaches inclined members and the axial direction of vertical columns. The axial entries enter the local FEF vector at indices `[0]` (i-end) and `[3]` (j-end):

```
Fx_i = L · (2·qx1 + qx2) / 6
Fx_j = L · (qx1 + 2·qx2) / 6
```

For uniform `qx` this reduces to `qx·L/2` per end — the standard consistent-FEF lumping for a 2-node axial bar. By keeping the axial term in the local FEF (rather than lumping straight into global F), element-level recovery `f = K·d_loc − FEF` reproduces the full axial reaction at each end, and `memberInternalForces` integrates the continuous distribution:

```
N(x) = N1 − qx1·x − (qx2 − qx1)·x²/(2L)
```

So a vertical column under self-weight shows the correct linear AFD (full integrated weight at the fixed base, tapering to the small joint-transfer value at the top) rather than a constant band at the half-weight value.

### Truss Element (v1.0.4+)

`memberType: "truss"` is implemented as a **frame element with M3 releases at both ends**, not the older axial-only formulation. The released-rotational DOFs θᵢ, θⱼ are removed by static condensation from the full 6×6 frame stiffness (`condensedTrussElement` in `solver.ts`):

- `K_cc = K_rr − K_rs · K_ss⁻¹ · K_sr` (retained DOFs r = [uᵢ, vᵢ, uⱼ, vⱼ]; released DOFs s = [θᵢ, θⱼ])
- The same condensation transforms the FEF vector: `FEF_cc = F_r − K_rs · K_ss⁻¹ · F_s`
- After padding back to 6×6 / length 6 with zeros at the θ positions, the element is shape-compatible with the frame path; the only difference is that its θ rows/cols are zero.

The result: transverse loads (including self-weight) produce a real simply-supported moment diagram between the end nodes — exactly matching SAP2000 — while end moments stay zero at the joints. Requires `EI > 0`; the input layer guards I33 > 0.

A leftover detail: pure-truss nodes (those connected only to released-end members) have zero θ stiffness in global K. The solver pins those θ DOFs to zero to keep K invertible.

### Self-weight load case

`solveCase("selfweight")` in `lib/analysis-pipeline.ts` synthesizes the body force on demand:

- For each member, compute `w = (sec.gamma ?? 0) · sec.A · 1e-6` kN/m. Skip if `w ≤ 0`.
- Build a `DistributedLoad` with `mode: "global-axis"`, `wyStart = wyEnd = −w`, attached to `loadCaseId: "selfweight"`.
- Pass the slice `{ ...model, loads: selfweightLoads }` to `analyze()`.

The synthetic loads never appear in `model.loads` — they exist only inside the case slice. Since the Selfweight LoadCase has `kind: "Dead"`, the existing combo generator includes it in every Dead-factor term (1.4D, 1.2D, …) automatically once the user enables it.

A consequence of this pure convention: the physical direction of a `local-axis` load depends on the member's i→j ordering. Reversing the a/b nodes rotates +local-2 by 180° and flips the load direction. This is a property of the local-axis convention, not a bug.

### Internal Force Interpolation

```
N(x) = N1 − qx1·x − (qx2−qx1)·x²/(2L)        (v1.0.7+)
V(x) = V1 − q1·x  − (q2−q1)·x²/(2L)
M(x) = M1 − V1·x  + q1·x²/2 + (q2−q1)·x³/(6L)
```

where `x` is distance from the i-end along the member.

> **Note:** `solver.ts` numerical math (`transformMatrix`, FEF formula, end-force extraction `N1=-f[0], V1=-f[1], M1=-f[2]`) is byte-stable. `localStiffness` gained an optional `GAs` parameter in v1.0.9 (Timoshenko, below) — with `GAs=0` it reduces algebraically to the original Euler matrix. Only `gaussSolve` (singular-pivot tracking + tightened tolerance, v1.0.6) and the `SolverResult` failure branch have otherwise changed. If a diagram looks wrong, suspect the display layer (local-2 direction in the drawer, invert toggle) before the solver.

### File I/O — JSON Save / Load (v1.0.10)

The File menu persists a model to disk and reads it back. JSON is the only format — it round-trips the full `StructureModel` (including nested section `derived` caches) losslessly; CSV was rejected because it cannot represent that nested data.

- **Save** — `handleSaveFile` (`App.tsx`): `JSON.stringify(model, null, 2)` → `Blob` → temporary `<a download>` named `openanstruk-structure-<YYYYMMDD-HHMM>.json`. Works on an empty canvas.
- **Load** — `handleLoadFile`: hidden `<input type="file" accept=".json">` → `FileReader` → `JSON.parse` (try/catch) → `isStructureModel` shape guard → standard model-swap reset, but seeded via `seedIdCounter(parsed)` rather than `resetIdCounter()`. A parse error or failed guard shows a `window.alert` and leaves state untouched.
- **`seedIdCounter(model)`** (`lib/model.ts`) seeds the single shared `idCounter` (used by all `n`/`m`/`l`/`s` prefixes) to the max numeric suffix found across loaded keys, so entities created after a load never collide with loaded ones. **`isStructureModel(x)`** is a lightweight runtime guard requiring the five entity records plus a non-empty `sections` map.
- `NavBar` gained `onSave` / `onLoad`; "New Canvas" was renamed "New File". Solver and model math are untouched.

### Undo / Redo (v1.0.11)

`src/hooks/use-model-history.ts` provides `useModelHistory({ model, setModel, draggingNodeId })` → `{ undo, redo, canUndo, canRedo, resetHistory }`. Because every mutation replaces `model` with a new immutable object, the hook keeps a **single stack of references** to past models (no clones, no JSON) — covering node/member/support/section *and* load edits, since loads live inside `model`. Capacity is capped at 20 (`.slice(-20)`).

Capture is observational: a `[model]` effect pushes the previous model onto the undo stack on every change, with two guards — (1) changes caused by undo/redo themselves are skipped (the apply path sets `prevModelRef = target` so the effect's identity check short-circuits), and (2) on-screen node drags are coalesced. The drag is bracketed by `draggingNodeId`; the hook records the pre-drag model at drag start and pushes it once on drag end **only if the model actually changed**, so a whole drag is a single undo and a click-without-move adds nothing. `resetHistory()` clears both stacks (called by the five whole-model swap handlers so undo never crosses a New/Load/template/example boundary). `analysisResult` is *not* snapshotted — it recomputes lazily on the Analyze tab.

**UI.** Two icon buttons (`Undo2`/`Redo2`) sit in an overlay card directly below the zoom slider in `structural-canvas.tsx` (props `onUndo`/`onRedo`/`canUndo`/`canRedo`); greyed when their stack is empty, with hover/active scale animation and `title` tooltips naming the shortcut. Keyboard shortcuts (Ctrl/Cmd+Z undo, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z redo) are registered in `App.tsx` and ignore form-field focus so native text-undo still works while typing. Both the card and the keyboard listener are **gated to the Model and Load tabs** — the Analyze tab is read-only, so undo/redo is unavailable there (the underlying stack is preserved across tab switches).

### Shear Deformation (Timoshenko, v1.0.9)

Opt-in shear flexibility, toggled by **"Enable Shear Deformation"** in the Settings panel (default off). `localStiffness(EA, EI, L, GAs = 0)` computes `Φ = 12·EI/(GAs·L²)` and scales the bending block by `1/(1+Φ)` (rotational diagonal `(4+Φ)EI/(L(1+Φ))`, carry-over `(2−Φ)EI/(L(1+Φ))`); axial terms unchanged. `GAs=0 ⇒ Φ=0`, so the off path is byte-identical to Euler. `analyze(model, { shearDeformation })` resolves per-member `GAs = G·As` where `As = Aκ2·1e-6` and `G = (sec.derived?.G ?? shearModulus(E, ν))·1000`; a missing/≤0 `Aκ2` falls back to Euler for that member. Applies through `condensedTrussElement` too, so trusses honor the toggle. FEF, recovery, and diagrams are untouched. Verified vs SAP2000 on Example 5 (`validation/shear_deformation_example5.md`).

### Analysis Diagnostics & Lazy Solve (v1.0.6)

A separate module `src/lib/analysis-diagnostics.ts` performs cheap structural pre-flight checks without calling the solver:

- **Empty-model checks** — no nodes / no members / no supports.
- **Reaction count** — fewer than 3 reaction components → error.
- **Connectivity** — union-find over members; every connected component must touch at least one supported node. Reports "There are nodes disconnected from any support" when a floating substructure exists.
- **γ = 0 sections** — lists referenced sections with no positive unit weight (warning, doesn't block).

It returns a typed `DiagnosticsReport { status, issues[] }` with three statuses — `determinate` / `indeterminate` / `unstable`. The first two are distinguished by the count formula `3m + r vs 3j` *only after* the error checks have passed.

**Solver-side singular DOF tracking.** `gaussSolve` in `solver.ts` returns the index of the failing DOF when the pivot drops below `1e-12 · max|diag(K)|`. `dofToLocation` translates it to `(nodeId, direction)`. The App layer (`mergedReport` memo in `App.tsx`) merges these into the diagnostics report so the issues dialog can say *"Instability detected. Likely cause: missing constraint or geometric mechanism."* alongside a node label.

**Lazy solve.** `solveAllCases` is gated on `activeTab === "Analyze"` in `App.tsx`. Editing in Model/Load tabs does not solve — entering the Analyze tab is the implicit "Analyze" trigger. Diagnostics remain reactive on every tab so the status-bar STATUS label is always live (the connectivity check is microseconds even on large models).

**UI surfaces.** The status bar shows the three-state STATUS pill (clickable). `src/components/analysis-issues-dialog.tsx` auto-opens once per Analyze-tab entry when there is any error-severity issue; closable via `×`, backdrop, or Esc. The γ = 0 warning is also rendered inline in the Load Case and Load Combination flyout tools.

---

## Canvas Rendering (`src/canvas/structural-canvas.tsx`)

The app uses the browser Canvas 2D API for all structural drawing — no SVG, no WebGL.

`structural-canvas.tsx` is the shell. It owns the viewport (`panX`, `panY`, `zoom`), mounts the canvas element, handles pointer/wheel events, and orchestrates the draw loop. Reusable atoms (`drawNodeIdTag`, `drawMemberIdTag`, `drawSupportGlyph`, `hitTestSupportGlyph`, box-selection helpers) live in sibling files under `src/canvas/`.

### Coordinate Systems

| Space  | Unit   | Y direction |
|--------|--------|-------------|
| World  | Metres | Up (structural convention) |
| Screen | Pixels | Down (canvas convention) |

`worldToScreen` and `screenToWorld` (in `lib/geometry.ts`) handle the Y-flip and scaling. The origin is dynamically centered based on canvas size via `axisCenter(rect)`.

Scale: **80 px/m** (`SCALE`). Grid cell: **40 px** = **0.5 m** (`GRID`, `SNAP`).

### Draw Order

1. Grid
2. Members
3. Supports
4. Nodes
5. Gizmo (axes)
6. Dimensions (if `showDimensions`)
7. Preview (Model tab — rubber-band, ghost node)
8. Loads (Load tab — arrows and distributed fills)
9. Glow (hover highlight)
10. Reactions / Axial / Shear / Moment / Deformed shape (Analyze tab, per-tool)
11. Box-selection rubber-band (drawn after `ctx.restore()` so it's in screen space)

### Diagram Rendering

Each diagram (shear, moment, axial) samples 60 points per member, then uses `splitByZeroCrossings` from `lib/diagram-utils.ts` to break the sampled curve into positive and negative segments (blue / red fills). The segments are offset along the member's local-2 axis — the same single rule for every member orientation.

The moment diagram is **negated before offsetting** so that positive (sagging) moments draw on the −local-2 side (the tension fiber).

`invertSFD` and `invertBMD` flags are pure user preferences: they flip the display side, swap colors, and negate label signs without changing the underlying solver values. Both default to **off**.

### AFD — mirrored band + i/j labels (v1.0.7+)

Unlike SFD/BMD, the AFD fills **both** sides of the member centerline symmetrically (a mirrored trapezoidal band). This removes the left/right side ambiguity that SAP-style one-sided AFDs introduce — the same fill reads the same regardless of member i→j ordering. The colors (blue = tension, red = compression) carry the sign.

Labels:

- **Frame members** — end labels at i and j (using `N1, N2`) plus an interior peak label when the peak differs from both ends. Lets readers see the linear ramp under axial distributed load (e.g. column self-weight).
- **Truss members, constant N** (`|N1 − N2| ≤ 0.01 kN`) — one centered label parallel to the member, offset past the mirrored band's edge.
- **Truss members, varying N** (`|N1 − N2| > 0.01 kN`) — two stacked lines (`i = …` / `j = …`) at the midpoint, parallel to the member. Surfaces the linear axial variation in inclined truss members under gravity components.

### Diagram Utilities (`src/lib/diagram-utils.ts`)

- `local2World(ax, ay, bx, by)` → unit local-2 vector `(-dy/L, dx/L)` in world space. No normalization, no quadrant flip — the pure right-hand-rule perpendicular for every member orientation.
- `splitByZeroCrossings<P>(pts, valueOf)` → generic zero-crossing splitter, used by both SFD (`valueOf = p => p.V`) and BMD (`valueOf = p => p.M`).

---

## Tabs and Tools

Each tab in `src/tabs/` owns a `tools/` folder. Each tool file is one React component (or a small set of co-located components) that renders the flyout content for that tool.

```
tabs/
├── model/tools/        select, delete, move-node, node, member, support
│   └── material/       material-tool (entry) + parametric/manual forms, shape-preview, …
├── load/tools/         point-load, dist-load, modify-load (+ DistributedLoadEditor), delete-load
├── analyze/tools/      select, reaction, diagram (shared by AXIAL/SHEAR/MOMENT), deformation
└── design/tools/       design-criteria, design-schedule, chart-text/chart-utils (shared),
                    rc/ (rc-design-tool, beam/, column/), steel/ (steel-design-tool,
                    preview, deck, beam/, column/)
```

**Adding a new tool is a one-folder change.** The router in `flyout-panel.tsx` and the tool-sidebar palette in `tool-sidebar.tsx` are the only places outside `tabs/` you need to touch.

---

## Design Engine (`src/lib/design/`)

A pure-domain layer that consumes analysis results to perform **RC beam + column design checks** (flexure, shear, P–M interaction; ACI 318-25 / SNI 2847:2019) and **steel member checks** (classification, axial, flexure + LTB, shear, Chapter H interaction; AISC 360-16 / SNI 1729:2020). It is a *consumer* of the solver — the DSM math is untouched. It envelopes exact analytic per-zone demands, then **dispatches each member to its material strategy** by `materialOf(section)`. Capacity in RC "As checked" mode comes from per-bar strain compatibility over a bar layout shared with the SVG cross-section preview.

**Two stages, split at the solver seam** (`design/core/run-design.ts`). `solveDesignCases()` holds the only expensive step — one stiffness factorization per enabled load case — and depends solely on the model, the cases and the shear-deformation flag. `designFromCases()` takes those solved cases plus the criteria and section inputs, and does the combination, envelope and clause work. `runDesign()` composes both for one-shot callers.

The split exists because the Design tab has no Run button: it recomputes on every input change, so a rebar keystroke must not re-factorize the stiffness matrix. `App.tsx` drives the stages separately and feeds stage 2 the *same* `caseResults` memo the Analyze tab uses, so switching Analyze ↔ Design reuses the factorization rather than repeating it.

The engine is split along two axes so new work is additive, not invasive (v1.1.2):
- **`design/core/`** — material-agnostic orchestrator, demands, designability matrix, result types, and `DesignCriteria { rc, steel }`.
- **`design/rc/`** — the RC strategy, itself split into **`shared/`** (code-agnostic bar/grid geometry, single-sourced) and **`codes/<code>/`** (the clause math — `aci318-25`, `sni2847-19` — duplicated per code edition, resolved at runtime via `getRcCode(criteria.rc.code)`).
- **`design/steel/`** — the steel strategy: five shapes (IWF, RHS, CHS, tee, single angle), one Chapter H check for beams and columns alike. Unlike RC there is no required/checked split — steel is always a *check* of the assigned section.

A `DESIGN_SUPPORT` registry (material × geometry × element, with an `implemented` flag) gates which combinations run, so a planned-but-unbuilt combination (an RC T-beam, say) shows "N.A." rather than crashing; enabling one means flipping a flag and adding a strategy branch.

**Two shapes break the "one `Mn` per section" assumption** the other three hold to, and both are worth knowing before reading the steel code: a **tee** is singly symmetric, so its capacity depends on the *sign* of the moment (F9); a **single angle**'s principal axes are rotated from the geometric axis the solver bends about, so one geometric moment produces two principal components and the member is checked with **H2**, not H1.

> The complete design logic, every governing code clause, the validation anchors, and the extension guide live in **[`DESIGN_RULES.md`](DESIGN_RULES.md)** (core), **[`DESIGN_RC.md`](DESIGN_RC.md)** and **[`DESIGN_STEEL.md`](DESIGN_STEEL.md)** — read them before touching `src/lib/design/`.

---

## Adding Features

### New tool
1. Add the tool ID to `ToolType` in [tool-sidebar.tsx](../src/components/tool-sidebar.tsx) and register it in the appropriate `*Tools` array.
2. Create the flyout content as `src/tabs/{tab}/tools/{name}-tool.tsx`.
3. Import + route in `components/flyout-panel.tsx`'s `FlyoutContent` switch.
4. Add the canvas-click branch in `handleCanvasClick` in [App.tsx](../src/App.tsx).
5. Add canvas preview rendering in [canvas/structural-canvas.tsx](../src/canvas/structural-canvas.tsx) if needed.

### New load type
1. Extend the `Load` union in [model.ts](../src/lib/model.ts).
2. Add assembly logic in [solver.ts](../src/lib/solver.ts).
3. Add a tool file in `src/tabs/load/tools/` and route from `flyout-panel.tsx`.
4. Add canvas rendering in [structural-canvas.tsx](../src/canvas/structural-canvas.tsx) (`drawLoads` block).

### New section shape
1. Add the kind to `SectionShape` union in [model.ts](../src/lib/model.ts).
2. Create `lib/sections/shapes/{kind}.ts` exporting a `ShapeDef` (defaults, validate, compute).
3. Register in `lib/sections/shapes/index.ts`'s `SHAPES` map.
4. The parametric form picks it up automatically.

### Modifying the solver
Edit [solver.ts](../src/lib/solver.ts). Always verify with multiple member orientations (horizontal, vertical, diagonal) and both load types. **`template4PortalLateral` is the strongest canary** — it exercises vertical columns, lateral loads, and all three support types. The sign convention table above is the reference.

---

## Constants and Colors

All shared numbers and colors live in [`src/lib/constants.ts`](../src/lib/constants.ts). Do not hardcode pixel sizes, tolerances, or hex colors elsewhere.

Key groups:
- **Coordinate**: `SCALE=80`, `GRID=40`, `SNAP=0.5`
- **Hit tolerances**: `HIT_TOL_NODE=0.2`, `HIT_TOL_MEMBER=0.15`, `HIT_TOL_NODE_SNAP=0.05`
- **Canvas colors**: brand, accent, selection, grid, load (fill/stroke/label), diagram (blue/red/orange/stroke)
- **Load drawing sizes**: arrow length, arrowhead, line widths, distributed arrow count
- **Diagram parameters**: pixels per kN, pixels per kN·m, label font

The flyout-panel palette is separately in [`src/lib/flyout-panel-colors.ts`](../src/lib/flyout-panel-colors.ts).

---

## Test Suite

There are currently no automated tests. Manual testing relies on the smoke matrix in [`REFACTOR_PLAN.md`](../REFACTOR_PLAN.md) (steps S1–S21) and on loading templates from the NavBar:

- **template1** — simple beam (pin–roller); basic SFD/BMD
- **template2** — cantilever; basic SFD/BMD
- **template3** — portal frame, gravity load
- **template4** — portal frame, lateral load — best canary: exercises horizontal + vertical members, all three support types, and a `local-axis` distributed load on a vertical column
- **template5** — asymmetric rafter; mixed member orientations

If you're touching the solver, the canvas, or sign math: load each template in turn and visually compare against expected diagram shapes before opening a PR.
