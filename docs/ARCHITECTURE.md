# Architecture

OpenAnstruk-2D is a browser-based 2D structural analysis application. This document explains how the codebase is organized and how the major pieces fit together — intended for contributors who want to understand the system before making changes.

## Overview

The app is a single-page React application with no backend. Everything — modeling, loading, and analysis — runs entirely in the browser. There is no server, no database, and no build-time data fetching.

The workflow follows three sequential steps:

```
Model  →  Load  →  Analyze
```

Each step maps to a tab in the UI. The user builds a structure, assigns loads, then runs analysis to view results.

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
│   │   └── sections/                  # Section/material domain (pure, no React)
│   │       ├── compute.ts             # buildParametricSection, computeSectionFromParametric
│   │       ├── materials/             # types, concrete, steel, index
│   │       └── shapes/                # types + rect, circle, iwf, tee, angle, chs, rhs
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
│   │   └── analyze/tools/             # select, reaction, diagram, deformation
│   │
│   ├── components/                    # Shared, tab-agnostic UI
│   │   ├── nav-bar.tsx                # Tab switcher + file/template menus
│   │   ├── tool-sidebar.tsx           # Per-tab tool palette; exports TabType, ToolType
│   │   ├── flyout-panel.tsx           # Thin router (props interface + FlyoutContent switch)
│   │   ├── flyout-shared.tsx          # Simple flat SectionSelect (used by Model-tab tools)
│   │   ├── status-bar.tsx             # Bottom status bar
│   │   ├── grid-units-panel.tsx       # Grid spacing + unit system panel
│   │   ├── theme-provider.tsx         # shadcn dark/light theme wrapper
│   │   └── ui/                        # shadcn primitives + project atoms
│   │       ├── numeric-input.tsx      # Controlled numeric input
│   │       ├── support-icons.tsx      # pinIcon, rollerIcon, fixedIcon
│   │       └── …                      # button, dialog, input, label, select, …
│   │
│   ├── hooks/
│   │   ├── use-toast.ts
│   │   └── use-mobile.ts
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
- Members have an optional `memberType`: `"frame"` (default; full beam-column with moment stiffness) or `"truss"` (pin-jointed, axial only).
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

One rule for every member: local-1 = i→j unit vector `(c, s) = (dx/L, dy/L)`; local-2 = local-1 rotated **+90° CCW** = `(-s, c)`. No normalization, no quadrant flips, no special cases for vertical members.

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

A consequence of this pure convention: the physical direction of a `local-axis` load depends on the member's i→j ordering. Reversing the a/b nodes rotates +local-2 by 180° and flips the load direction. This is a property of the local-axis convention, not a bug.

### Internal Force Interpolation

```
V(x) = V1 − q1·x − (q2−q1)·x²/(2L)
M(x) = M1 − V1·x + q1·x²/2 + (q2−q1)·x³/(6L)
```

where `x` is distance from the i-end along the member.

> **Note:** `solver.ts` numerical math (`localStiffness`, `transformMatrix`, FEF formula, end-force extraction `N1=-f[0], V1=-f[1], M1=-f[2]`) is byte-stable. If a diagram looks wrong, suspect the display layer (local-2 direction in the drawer, invert toggle) before the solver.

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
└── analyze/tools/      select, reaction, diagram (shared by AXIAL/SHEAR/MOMENT), deformation
```

**Adding a new tool is a one-folder change.** The router in `flyout-panel.tsx` and the tool-sidebar palette in `tool-sidebar.tsx` are the only places outside `tabs/` you need to touch.

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
