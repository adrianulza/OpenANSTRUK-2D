# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenANSTRUK-2D is a 2D structural analysis application built as a single-page app. It provides a CAD-like interface for modeling structures, applying loads, and viewing analysis results (shear/moment diagrams, deformation).

**Status: Model, Load, and Analyze tabs are fully functional with recent improvements: solver sign convention consistency, diagram orientation fixes for vertical members, point load direction handling.**

## Commands

- `npm run dev` — Start Vite dev server (localhost:5173)
- `npm run build` — TypeScript check + Vite production build
- `npm run lint` — ESLint check
- `npm run format` — Format code with Prettier
- `npm run format:check` — Check formatting without modifying
- `npm run preview` — Preview production build locally

## Tech Stack

- **React 19** with TypeScript, bundled by **Vite 6**
- **Tailwind CSS v4** (uses `@import 'tailwindcss'` syntax, not v3 config file)
- **shadcn/ui** (new-york style, non-RSC mode) — components in `src/components/ui/`
- **Radix UI** primitives underneath shadcn
- **Lucide React** for icons
- **Canvas API** for structural visualization and diagram rendering
- Path alias: `@/*` maps to `src/` (not project root)

## Architecture

The app is a single-view React component with tab-based workflow. No router, no backend.

### State Management
- **Centralized in `App.tsx`**: All top-level state owned by root component: `activeTab`, `activeTool`, `model`, `selection`, `pendingFrameStart`, `activeSection`, `activeSupportType`, unit system, cursor position, dimensions toggle, `analysisResult`, `diagramScale`.
- **Prop-drilling**: State passed down to children; no context or Redux.
- **Model as source of truth**: `StructureModel` (in `lib/model.ts`) is the immutable data source. All UI updates via `setModel`.

### Component Hierarchy
```
src/App.tsx (root state, canvas interaction, effects)
├── NavBar (tab switcher)
├── ToolSidebar (tool selection per tab)
├── StructuralCanvas (canvas rendering, visualization)
├── FlyoutPanel (contextual properties for selected tool/object)
└── StatusBar (info display)
```

### Tab Workflow
1. **Model** — Create/edit structure (nodes, members, supports, materials)
2. **Load** — Assign point and distributed loads
3. **Analyze** — View reactions, shear/moment/axial diagrams, deformation

Each tab has unique tools and interactions defined in `tool-sidebar.tsx`.

## Data Model (`src/lib/model.ts`)

```typescript
StructureModel {
  nodes:    Record<NodeId, ModelNode>        // {id, x, y} in world metres
  members:  Record<MemberId, Member>         // {id, a, b, section}
  supports: Record<NodeId, Support>          // {nodeId, type: pin|roller|fixed}
  sections: Record<SectionId, Section>       // {id, name, E, I, A, W, nu}
  loads:    Record<LoadId, Load>             // PointLoad | DistributedLoad
}
```

**Key types:**
- **PointLoad**: `{id, type:"point", nodeId, magnitude (kN ≥ 0), angle (degrees)}`. One per node. Magnitude positive; direction via angle (0°=right, 90°=up).
- **DistributedLoad**: `{id, type:"distributed", memberId, wStart, wEnd (kN/m)}`. One per member. Perpendicular to member in CCW direction.
- **Section** (I-beams): `iwf150`, `iwf200`, `wf300` (E in MPa, I/A in standard units, W = section modulus).
- **Support**: pin (fixes u,v), roller (fixes v), fixed (fixes u,v,θ).

**Default model:** 5 m simple beam at y=0; midspan node at origin; pin+roller supports; 10 kN downward at midspan.

## Solver (`src/lib/solver.ts`)

### Algorithm
Direct stiffness method (DSM) for 2D frame elements.

1. **Assembly**: Global stiffness matrix K, force vector F
2. **BCs**: Zero-row/column method for constrained DOFs
3. **Solution**: Solve K·d = F for nodal displacements d
4. **Recovery**: Extract member end forces from element stiffness and d

### Sign Conventions (Critical)

**Member internal forces:**
- **N** (axial): tension positive, compression negative
- **V** (shear): force on +face in +local-y direction; for horizontal members: left portion pushes right portion upward = positive
- **M** (moment): sagging positive (CCW on left face); hogging negative

**Member end force extraction from local stiffness vector `f`:**
- `N1 = -f[0]`, `V1 = -f[1]`, `M1 = -f[2]` (i-end: all negated)
- `N2 =  f[3]`, `V2 =  f[4]`, `M2 =  f[5]` (j-end: no negation)

**Reactions (`K_orig · d − F_orig`):**
- This formula gives the force the support exerts **on the structure** (not action on support)
- **Rx**: positive = support pushes structure rightward
- **Ry**: positive = support pushes structure upward
- **Mz**: positive = support applies CCW moment to structure

### Distributed Load Sign Flip
**Critical for correctness**: When a member points left (dx < 0) or upward (dy > 0), the distributed load parameters `q1`/`q2` are negated in both:
- **Assembly phase**: Before computing fixed-end forces (FEF)
- **Recovery phase**: Before interpolating internal forces

This ensures `q1`/`q2` used for force interpolation matches what went into FEF computation.

### Internal Force Interpolation (per member)
```
V(x) = V1 − q1·x − (q2−q1)·x²/(2L)
M(x) = M1 − V1·x + q1·x²/2 + (q2−q1)·x³/(6L)
```
where x ∈ [0, L] is distance along member from i-end.

### Unit Conversions (per member)
- `E_kNm2 = E_MPa × 1000` (MPa → kN/m²)
- `I_m4 = I_mm4 × 1e-12`
- `A_m2 = A_mm2 × 1e-6`

## Canvas Rendering (`src/components/structural-canvas.tsx`)

### Coordinate System
- **World**: Metres (real structure coords)
- **Screen**: Pixels (canvas coords, Y-axis flipped)
- **Conversion**: `worldToScreen(p, rect)` / `screenToWorld(p, rect)` (rect = canvas bounding box)
- **Scale**: 80 px/m, grid cell = 40 px (0.5 m snap)

### Rendering Layers (draw order)
1. Grid (light gray)
2. Structure (members, nodes, supports)
3. Loads (point/distributed, color `#0BE77E`)
4. Selections (accent blue overlay)
5. Diagrams (SFD/BMD overlays when Analyze tab)
6. Annotations (dimensions, axis gizmo)
7. Previews (rubber-band, box-select overlay)

### Diagram Rendering
**Shear & Moment diagrams** sample 60 points per member, split at sign changes, fill with blue (positive) or red (negative), offset perpendicular to member.

**Vertical member fix**: For vertical members (dx ≈ 0), the perpendicular direction is reversed before offsetting so positive shear/moment appears on the left of the centerline (user expectation).

### Perpendicular Direction
`perpWorld(ax, ay, bx, by)` returns unit perpendicular in world space, normalized so `ny ≥ 0` (or `nx > 0` for vertical). In screen space, apply Y-flip: `(nx, -ny)`.

### Display Conventions (Sign → Color → Direction)

**Colors:**
- **Blue (`#2563eb`)** — positive value (tension, sagging, upward/rightward reaction, CCW moment)
- **Red (`#ef4444`)** — negative value (compression, hogging, downward/leftward reaction, CW moment)

**Axial diagram (AFD):**
- Offset = `N · BASE · (spx, spy)` — positive N (tension) offsets in +perp direction, negative (compression) in −perp
- Blue = tension, red = compression

**Shear diagram (SFD):**
- Offset = `V · BASE · (spx, spy)` — positive V offsets in +perp, negative in −perp
- Blue = positive shear, red = negative shear
- Vertical members: perpendicular direction reversed so positive shear appears on left of centerline

**Moment diagram (BMD):**
- Offset = `−M · BASE · (spx, spy)` — **negated** so positive M (sagging) draws on tension-fiber side (opposite perp)
- Blue = sagging (positive), red = hogging (negative)
- Vertical members: same perpendicular reversal as SFD

**Reaction arrows:**
- **Ry**: arrow originates below node for positive (upward), above node for negative (downward); tip points toward node
- **Rx**: arrow originates left of node for positive (rightward), right for negative (leftward); tip points toward node
- **Mz**: 3/4-circle arc; positive (CCW structural) = CW arc on screen (Y-flip); negative = CCW arc on screen
  - Arc arrowhead: blue (positive) at top of arc, red (negative) at bottom of arc

## Geometry Utilities (`src/lib/geometry.ts`)

| Function | Purpose |
|----------|---------|
| `worldToScreen(p, rect)` | World metres → canvas pixel |
| `screenToWorld(p, rect)` | Canvas pixel → world metres |
| `snapWorld(p)` | Snap world point to 0.5 m grid |
| `hitTestNode(model, w, tol)` | Nearest node within tolerance (default 0.15 m) |
| `hitTestMember(model, w, tol)` | Nearest member midspan within tolerance |
| `findNodeAt(model, w, tol)` | Exact node lookup at 0.05 m tolerance |
| `addNode(model, w)` | Creates node, returns `{model, id}` |
| `splitMember(model, memberId, nodeId)` | Splits member at node into two members |

## Units System (`src/lib/units.ts`)

- **Default**: kN, m, kN/m, MPa, mm⁴, mm²
- **Display helpers**: Convert E/I/A/W across unit systems (SI, Imperial, etc.)
- `UnitSettings` type and `DEFAULT_UNIT_SETTINGS` in constants

## Canvas Interaction (`src/App.tsx`, `handleCanvasClick`)

Each tool (SELECT, NODE, FRAME, etc.) maps to a handler:
- **SELECT**: Click/drag to select nodes/members/supports. Multi-select (additive). Deselect by clicking again.
- **NODE**: Click to place node (snapped). Auto-splits member if placed on one.
- **FRAME**: Click → place node A + preview; click again → place node B + create member. Auto-splits intersected members.
- **SUPPORT**: Click node to assign. Type chosen in flyout.
- **POINT_LOAD**: Click node to place. Magnitude/angle in flyout.
- **DISTRIBUTED_LOAD**: Click member to place. wStart/wEnd in flyout.

## Key Conventions

- Source files live in `src/` (`App.tsx`, `main.tsx`, `globals.css`, components, lib, hooks, templates)
- CSS in `globals.css` only; uses Tailwind v4 `@theme inline` for design tokens (oklch colors), no `tailwind.config` file
- Node/member IDs monotonic: `newNodeId()` → `"n1"`, `"n2"`, …
- Brand color: `#1a2f5e` (navy); accent: `#2563eb` (blue); loads: fill `#D7FDEB`, stroke `#0BE77E`, label `#107343`
- Fonts: Inter (sans), JetBrains Mono (mono) in `globals.css`
- `handleCanvasClick` uses `model` from closure (always current via dependency array)

## What Is Working

### Model Tab
- **SELECT**: Full support for multi-select, deselect, property panel
- **NODE**: Click to place (snapped), auto-splits members
- **FRAME**: Two-click to create members, duplicate detection, auto-split intersected members
- **SUPPORT**: Assign pin/roller/fixed to nodes
- **MATERIAL**: View/edit E, I, A, W, nu; changes persist in model

### Load Tab
- **POINT_LOAD**: Full (click node, flyout sets angle 0–360° and magnitude ≥ 0; one per node)
- **DISTRIBUTED_LOAD**: Full (click member, flyout sets wStart/wEnd; one per member)
- **MODIFY_LOAD**: Full (click load, edit/delete via flyout)

### Analyze Tab
- **REACTION**: Full (displays Rx, Ry, Mz at supports; toggle report)
- **SHEAR**: Full (SFD with positive=blue, negative=red; scale slider)
- **MOMENT**: Full (BMD with sagging=blue, hogging=red; shared scale)
- **AXIAL**: Full (AFD with tension=blue, compression=red)
- **DEFORMATION**: Full (render deformed shape)

## Templates

Five pre-configured templates (`src/templates/`) for testing:
- **template1**: Simple 5 m beam (pin–roller)
- **template2**: Cantilever (fixed–free)
- **template3**: Portal frame (gravity load)
- **template4**: Portal frame (lateral load) — good for vertical member diagrams
- **template5**: Asymmetric rafter

## Testing

No test suite currently. For manual testing:
- Portal lateral (template4) recommended for vertical column diagrams and perpendicular load handling
- Simple beam (template1) for basic SFD/BMD validation
- Portal gravity (template3) for combined vertical + perpendicular loading on frames
- Asymmetric rafter (template5) for mixed member orientations and distributed loads

## Common Development Tasks

### Adding a new tool
1. Add tool type to `tool-sidebar.tsx` (`ToolType`)
2. Add UI handler in `handleCanvasClick` (App.tsx)
3. Add flyout UI in `flyout-panel.tsx` (SelectedLoadType or new type)
4. Render preview/overlay in `structural-canvas.tsx` if needed

### Modifying the solver
1. Edit `lib/solver.ts` (DSM assembly/recovery)
2. Test with Model → Load → Analyze workflow
3. Verify sign conventions match diagram expectations (SFD/BMD orientation)

### Changing canvas rendering
1. Edit `structural-canvas.tsx` (draw functions)
2. Test with different member orientations (horizontal, vertical, angled)
3. Verify vertex members render correctly (perpendicular direction matters)

### Adding a new load type
1. Extend `Load` union in `lib/model.ts`
2. Add assembly logic in `lib/solver.ts`
3. Add UI in `flyout-panel.tsx`
4. Add canvas rendering in `structural-canvas.tsx`

## Performance Notes

- Canvas rendering is CPU-bound; 60+ node/member structures may experience lag at high zoom levels
- Solver scales as O(n³) for n DOFs; typically responsive for portal frames (< 50 DOFs)
- No memoization of geometry or solver results; all computed on every render (acceptable for current scope)

## Debugging Tips

- **Solver issues**: Check solver output object for `ok: false` with reason string
- **Diagram inversions**: Verify perpendicular direction and sign-flip logic for distributed loads
- **Geometry misalignment**: Check world↔screen conversion; canvas bounding rect may differ from expected
- **Load rendering**: Verify load constants in `lib/constants.ts` (LOAD_PT_*, LOAD_DIST_*)
- **Browser DevTools**: React DevTools for state inspection, Network tab for asset loading, Console for errors
