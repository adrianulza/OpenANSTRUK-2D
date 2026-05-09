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

```
OpenAnstruk-2D/
├── README.md
├── html/                        # Static HTML entry points
│   ├── index.html               # Landing page (standalone, no Vite — DM Serif/Sans fonts)
│   └── app.html                 # React app shell (loads /src/main.tsx via Vite)
├── public/                      # Static assets copied as-is to dist/
│   ├── demo/                    # Demo screenshots (1.png–8.png) used on landing page
│   ├── _headers                 # Netlify/CDN response headers
│   ├── _redirects               # Netlify SPA redirect rules
├── src/                         # All React/TS source
│   ├── App.tsx                  # Root component — all state, canvas handlers
│   ├── main.tsx                 # Vite entry point, mounts <App />
│   ├── globals.css              # Tailwind v4 import + @theme design tokens
│   ├── components/
│   │   ├── nav-bar.tsx          # Tab switcher + file/template dropdown menus
│   │   ├── tool-sidebar.tsx     # Per-tab tool palette; exports TabType, ToolType
│   │   ├── structural-canvas.tsx# Canvas rendering (structure, loads, diagrams)
│   │   ├── flyout-panel.tsx     # Contextual property panel (right side)
│   │   ├── status-bar.tsx       # Bottom status bar (cursor coords, info)
│   │   ├── grid-units-panel.tsx # Grid spacing + unit system settings panel
│   │   ├── theme-provider.tsx   # shadcn dark/light theme wrapper
│   │   └── ui/                  # shadcn/ui primitives (button, input, dialog, …)
│   ├── lib/
│   │   ├── model.ts             # StructureModel types + model mutation helpers
│   │   ├── solver.ts            # DSM finite element solver
│   │   ├── geometry.ts          # Coordinate transforms, hit-testing, snap
│   │   ├── constants.ts         # All shared magic numbers and colors
│   │   ├── units.ts             # UnitSettings, display/parse helpers
│   │   ├── svg-renderer.ts      # Renders StructureModel → static SVG string
│   │   └── utils.ts             # shadcn cn() utility
│   │   └── flyout-panel-colors.ts # Controling flyout colors
│   ├── hooks/
│   │   ├── use-toast.ts         # Toast notification hook
│   │   └── use-mobile.ts        # Mobile breakpoint hook
│   └── templates/
│       ├── examples.ts          # Five static example model builder functions
│       ├── examples-data.ts     # ExampleDefinition metadata + SVG illustrations
│       ├── examples-modal.tsx   # Examples picker modal (card grid with SVG thumbs)
│       ├── beam-template-modal.tsx   # Parametric multi-span beam builder modal
│       ├── frame-template-modal.tsx  # Parametric portal frame builder modal
│       └── truss-template-modal.tsx  # Parametric truss builder modal
├── config/                      # Build tooling config (isolated from project root)
│   ├── vite.config.ts
│   ├── eslint.config.js
│   └── tsconfig.json
├── docs/
│   ├── ARCHITECTURE.md          # Codebase structure and design decisions (for contributors)
│   ├── CONTRIBUTING.md          # How to contribute (code, bugs, docs, feedback)
│   └── USER_GUIDE.md            # End-user usage guide
├── tsconfig.json                # Root tsconfig (references config/tsconfig.json)
├── package.json
├── package-lock.json
├── LICENSE                      # MIT License
```

---

## State Management

All state is owned by `App.tsx` and passed down via props. There is no Context, Redux, or Zustand.

The central piece of state is `model: StructureModel` — a plain immutable object that is the single source of truth for the entire structure. Every user action that changes the structure produces a new model object via `setModel(...)`.

Other important state buckets in `App.tsx`:
- **UI state**: `activeTab`, `activeTool`, `selection`, `pendingFrameStart`
- **Tool settings**: `activeSection`, `activeMemberType`, `activeSupportType`
- **Load input**: `activePtInputMode`, `activeDistMode`, `activeDistType`, and their magnitude fields
- **Analyze state**: `analysisResult`, `diagramScale`, `invertSFD`, `invertBMD`, `deformationScale`
- **Hover state**: `hoveredNodeId`, `hoveredMemberId`, `hoveredLoadId`

### Data Flow

```
User interaction (canvas click / flyout input)
        ↓
handleCanvasClick / handler in App.tsx
        ↓
setModel(newModel)          ← immutable update
        ↓
StructuralCanvas re-renders ← draws updated structure
        ↓
analyze(model)              ← runs on every model change when Analyze tab is active
        ↓
setAnalysisResult(result)
        ↓
StructuralCanvas re-renders ← draws diagrams
```

---

## Data Model (`src/lib/model.ts`)

The structure is represented as a flat record-based graph:

```typescript
StructureModel {
  nodes:    Record<NodeId, ModelNode>     // {id, x, y} in metres
  members:  Record<MemberId, Member>      // {id, a, b, section, memberType?}
  supports: Record<NodeId, Support>       // {nodeId, type: "pin"|"roller"|"fixed"}
  sections: Record<SectionId, Section>    // material + cross-section properties
  loads:    Record<LoadId, Load>          // PointLoad | DistributedLoad
}
```

**Key design decisions:**
- IDs are string-keyed monotonic counters (`"n1"`, `"m1"`, `"l1"`, …). They never reset during a session.
- One load per node (point loads), one load per member (distributed loads) — enforced by the UI.
- Members have an optional `memberType`: `"frame"` (default, full beam-column with moment stiffness) or `"truss"` (pin-jointed, axial only).
- `PointLoad` stores `{fx, fy}` global components in kN. The flyout supports both direct component input and angular input (magnitude + angle) — conversion happens in the UI layer.
- `DistributedLoad` supports two modes: `"local-axis"` (perpendicular to member, the default) and `"global-axis"` (X/Y world components).

---

## Solver (`src/lib/solver.ts`)

The solver implements the **Direct Stiffness Method (DSM)** for 2D frame/truss elements.

### Steps

1. **Assembly** — Build global stiffness matrix `K` and force vector `F` by summing element contributions. Distributed loads are converted to fixed-end forces (FEF) in the assembly phase.
2. **Boundary conditions** — Constrained DOFs are zeroed out (zero-row/column method).
3. **Solve** — `K·d = F` solved for nodal displacements `d`.
4. **Recovery** — Member end forces extracted from element stiffness and `d`. Internal force distributions interpolated along each member.

### Sign Conventions

| Quantity | Positive direction |
|----------|-------------------|
| Axial N  | Tension |
| Shear V  | Left portion pushing right portion upward (horizontal member) |
| Moment M | Sagging (concave upward) |
| Rx reaction | Support pushes structure rightward |
| Ry reaction | Support pushes structure upward |
| Mz reaction | Support applies CCW moment to structure |

### Distributed Load Sign Flip

When a member points left (`dx < 0`) or upward (`dy > 0`), the local load parameters `q1`/`q2` are negated in both the assembly and recovery phases. This keeps sign conventions consistent regardless of which direction a member was drawn.

### Internal Force Interpolation

```
V(x) = V1 − q1·x − (q2−q1)·x²/(2L)
M(x) = M1 − V1·x + q1·x²/2 + (q2−q1)·x³/(6L)
```

where `x` is distance from the i-end along the member.

---

## Canvas Rendering (`src/components/structural-canvas.tsx`)

The app uses the browser Canvas 2D API for all structural drawing — no SVG, no WebGL.

### Coordinate Systems

| Space  | Unit   | Y direction |
|--------|--------|-------------|
| World  | Metres | Up (structural convention) |
| Screen | Pixels | Down (canvas convention) |

`worldToScreen` and `screenToWorld` (in `lib/geometry.ts`) handle the Y-flip and scaling. The origin is dynamically centered based on canvas size via `axisCenter(rect)`.

Scale: **80 px/m** (`SCALE`). Grid cell: **40 px** = **0.5 m** (`GRID`, `SNAP`).

### Draw Order

1. Grid
2. Structure (members, nodes, supports)
3. Loads (arrows and distributed load fills)
4. Selections (highlight overlay)
5. Diagrams (SFD / BMD / AFD — Analyze tab only)
6. Annotations (dimension lines, axis gizmo)
7. Previews (rubber-band line, box-select rectangle)

### Diagram Rendering

Each diagram (shear, moment, axial) samples 60 points per member, fills regions between the baseline and curve in blue (positive) or red (negative), and offsets perpendicular to the member.

The moment diagram is **negated before offsetting** so that positive (sagging) moments draw on the tension fiber side — the structural convention.

For vertical members, the perpendicular direction is reversed so positive values appear on the left of the centerline.

`invertSFD` and `invertBMD` flags allow the user to flip diagram orientation without changing the underlying sign convention.

---

## Adding Features

### New tool
1. Add the tool ID to `ToolType` in [tool-sidebar.tsx](../src/components/tool-sidebar.tsx)
2. Add the canvas handler in `handleCanvasClick` in [App.tsx](../src/App.tsx)
3. Add the flyout UI in [flyout-panel.tsx](../src/components/flyout-panel.tsx)
4. Add canvas preview rendering in [structural-canvas.tsx](../src/components/structural-canvas.tsx) if needed

### New load type
1. Extend the `Load` union in [model.ts](../src/lib/model.ts)
2. Add assembly logic in [solver.ts](../src/lib/solver.ts)
3. Add UI in [flyout-panel.tsx](../src/components/flyout-panel.tsx)
4. Add canvas rendering in [structural-canvas.tsx](../src/components/structural-canvas.tsx)

### Modifying the solver
Edit [solver.ts](../src/lib/solver.ts). Always verify with multiple member orientations (horizontal, vertical, diagonal) and both load types. The sign convention table above is the reference.

---

## Constants and Colors

All shared numbers and colors live in [`src/lib/constants.ts`](../src/lib/constants.ts). Do not hardcode pixel sizes, tolerances, or hex colors elsewhere.

Key groups: coordinate scale, hit-test tolerances, canvas colors, load drawing sizes, diagram rendering parameters.

---

## Test Suite

There are currently no automated tests. Manual testing is done by loading templates from the NavBar and verifying diagram correctness:

- **template1** — simple beam, basic SFD/BMD
- **template1** — cantilever beam, basic SFD/BMD
- **template3** — portal frame, gravity load
- **template4** — portal frame, lateral load (best for vertical member diagrams)
- **template5** — asymmetric rafter, mixed member orientations
