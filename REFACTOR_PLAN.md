# Refactor Plan: Tab-Sliced Project Structure

> **Status:** Approved, in progress on branch `refactor/tab-structure`.
> **Goal:** Pure structural refactor — no feature changes, no behavior changes. Same app, internal reorganization to unblock Load Cases and future work.
> **Recovery:** If anything breaks, this file is the source of truth. Each phase ends with a git commit; worst-case rollback is one commit.

---

## Context

The codebase has grown to ~13,500 LoC concentrated in three God files:

- `src/components/structural-canvas.tsx` — **2703 lines**, 15 draw functions for all tabs
- `src/components/flyout-panel.tsx` — **2169 lines**, 15 tool panels routed by `(activeTab, activeTool)`
- `src/App.tsx` — **904 lines**, ~40 state hooks and a 224-line `handleCanvasClick`

We originally planned to add Load Cases & Combinations next, but adding a 4th tab to these files would push them past 3000 lines each and make every future feature painful. We are pausing feature work to do this **structural refactor first**.

The target structure co-locates each tool's vertical slice — sidebar button + flyout panel + canvas draw functions — into one folder per tab. This makes "add a tool" = "add one folder", and unblocks Load Cases as a clean `tabs/load-cases/` addition.

**Intended outcome:** Same app, same behavior, same UI. Internal structure reorganized so the next feature (Load Cases) and all future features are isolated changes.

---

## Target Structure

```
src/
├── App.tsx                          # Trim to <300 lines: tab/tool routing + glue
├── main.tsx
├── globals.css
│
├── lib/                             # Pure domain (no React) — unchanged + 2 additions
│   ├── model.ts                     # (existing)
│   ├── solver.ts                    # (existing)
│   ├── geometry.ts                  # (existing)
│   ├── constants.ts                 # (existing)
│   ├── units.ts                     # (existing)
│   ├── utils.ts                     # (existing)
│   ├── svg-renderer.ts              # (existing)
│   ├── flyout-panel-colors.ts       # (existing)
│   ├── diagram-utils.ts             # NEW: segment-split + perpWorld (extracted)
│   └── sections/                    # MOVED from features/material/
│       ├── compute.ts
│       ├── materials/
│       └── shapes/
│
├── canvas/                          # NEW: Canvas shell + shared draw primitives
│   ├── structural-canvas.tsx        # Thin shell: viewport, events, draw loop
│   ├── viewport.ts                  # Pan/zoom state, hooks
│   ├── box-selection.ts             # computeBoxSelection*, hitTestSupportGlyph
│   ├── support-glyph.ts             # drawSupportGlyph (used by Model + Analyze tabs)
│   ├── id-tags.ts                   # drawNodeIdTag, drawMemberIdTag
│   ├── zoom-slider.tsx              # NEW: extracted zoom UI
│   ├── types.ts                     # DrawContext type
│   └── draws/
│       ├── grid.ts
│       ├── gizmo.ts
│       ├── dimensions.ts
│       ├── preview.ts
│       ├── supports.ts
│       └── glow.ts
│
├── tabs/
│   ├── model/
│   │   ├── tools/
│   │   │   ├── select-tool.tsx      # ModifyComponentToolContent
│   │   │   ├── node-tool.tsx        # NodeToolContent
│   │   │   ├── member-tool.tsx      # MemberToolContent
│   │   │   ├── support-tool.tsx     # SupportToolContent
│   │   │   ├── move-node-tool.tsx   # MoveNodeToolContent
│   │   │   ├── delete-tool.tsx      # DeleteComponentToolContent
│   │   │   └── material/            # MOVED from features/material/
│   │   │       ├── material-tool.tsx        # (was material-flyout.tsx)
│   │   │       ├── parametric-form.tsx
│   │   │       ├── manual-form.tsx
│   │   │       ├── advanced-panel.tsx
│   │   │       ├── advanced-pill.tsx
│   │   │       ├── shape-preview.tsx
│   │   │       └── section-select.tsx
│   │   ├── canvas/
│   │   │   ├── draw-members.ts
│   │   │   └── draw-nodes.ts
│   │   └── handlers/                # Phase 6
│   │       ├── node-click.ts
│   │       ├── member-click.ts
│   │       ├── support-click.ts
│   │       └── move-node-click.ts
│   │
│   ├── load/
│   │   ├── tools/
│   │   │   ├── point-load-tool.tsx
│   │   │   ├── dist-load-tool.tsx
│   │   │   ├── modify-load-tool.tsx   # + DistributedLoadEditor (kept here)
│   │   │   └── delete-load-tool.tsx
│   │   ├── canvas/
│   │   │   └── draw-loads.ts
│   │   ├── handlers/                # Phase 6
│   │   │   ├── point-load-click.ts
│   │   │   ├── dist-load-click.ts
│   │   │   └── modify-delete-click.ts
│   │   └── use-load-tool-state.ts   # Phase 6: groups all active{Pt,Dist}* + selectedLoad* state
│   │
│   └── analyze/
│       ├── tools/
│       │   ├── select-tool.tsx        # AnalyzeSelectContent
│       │   ├── reaction-tool.tsx
│       │   ├── axial-tool.tsx
│       │   ├── shear-tool.tsx
│       │   ├── moment-tool.tsx
│       │   └── deformation-tool.tsx
│       ├── canvas/
│       │   ├── draw-reactions.ts
│       │   ├── draw-axial.ts
│       │   ├── draw-shear.ts
│       │   ├── draw-moment.ts
│       │   ├── draw-deformation.ts
│       │   └── draw-deform-hover.ts
│       └── use-analyze-display-state.ts  # Phase 6
│
├── components/                      # Truly shared (tab-agnostic)
│   ├── nav-bar.tsx                  # (existing, unchanged)
│   ├── tool-sidebar.tsx             # (existing, unchanged — already clean)
│   ├── flyout-panel.tsx             # Trim to thin router (~200 lines)
│   ├── status-bar.tsx               # (existing, unchanged)
│   ├── grid-units-panel.tsx         # (existing, unchanged)
│   ├── theme-provider.tsx           # (existing, unchanged)
│   └── ui/
│       ├── numeric-input.tsx        # EXTRACTED from flyout-panel.tsx
│       ├── support-icons.tsx        # EXTRACTED: pinIcon, rollerIcon, fixedIcon
│       └── (all existing shadcn primitives unchanged)
│
├── templates/                       # Unchanged
└── hooks/                           # Unchanged
```

---

## Strategy: Bottom-Up, Behavior-Preserving

The order is critical. Each step must leave the build green and the app functioning identically. The rule: **never refactor and rename in the same commit.**

1. **Leaves first** — extract shared atoms (NumericInput, icons, support glyph, id tags) without touching their call sites' logic. Just relocate and re-import.
2. **Pure functions next** — extract diagram-utils (perpWorld, segment-split) from canvas. Replace duplicated logic with imports.
3. **Move `features/material/` → `tabs/model/tools/material/` and `lib/sections/`** — pure rename + import path updates.
4. **Split flyout-panel** by tab. Each tool's content component moves to its tab folder, flyout-panel.tsx becomes a router. **Props interface stays identical** — no signature changes.
5. **Split canvas draw functions** by tab. Each draw function moves to its tab folder as a pure `(ctx, rect, state) => void`. structural-canvas.tsx becomes a shell that imports and calls them in the existing order.
6. **Slim App.tsx last** — only after the above are done, group related state into per-tab hooks (`useModelTabState`, `useLoadTabState`, `useAnalyzeTabState`). This is the highest-risk step and is done last when everything else is stable.

After each step: build → lint → manual smoke test → commit. The repo stays shippable at every commit.

---

## Detailed Step Sequence

### Phase 0 — Safety Net

Set up validation before any changes.

- Create branch `refactor/tab-structure`
- Capture baseline: `npm run build` + `npm run lint` must pass on `main`. Record both as the "green baseline".
- Build a manual smoke checklist (see Validation section below)
- Take a "golden state" screenshot of the app loaded with `template4PortalLateral` showing reactions + SFD + BMD — this is the visual regression reference
- Capture `analysisResult` JSON fixtures for `template1SimpleBeam` and `template4PortalLateral` — committed to `__fixtures__/` for numerical regression detection

### Phase 1 — Extract Atoms (Low Risk)

**1.1 NumericInput** (`flyout-panel.tsx` lines 1019-1071)
- Create `src/components/ui/numeric-input.tsx` with the same component
- Replace internal references in `flyout-panel.tsx` with `import { NumericInput } from "@/components/ui/numeric-input"`
- Validate: build + smoke test load input fields

**1.2 Support icons** (`flyout-panel.tsx` lines 24-48)
- Create `src/components/ui/support-icons.tsx` exporting `pinIcon`, `rollerIcon`, `fixedIcon`
- Replace inline references

**1.3 SectionSelect** (`flyout-panel.tsx` lines 548-581)
- Keep in flyout-panel.tsx for now — gets moved with material in Phase 3

**1.4 Canvas helpers**
- Create `src/canvas/id-tags.ts` with `drawNodeIdTag`, `drawMemberIdTag`
- Create `src/canvas/support-glyph.ts` with `drawSupportGlyph` and `hitTestSupportGlyph`
- Create `src/canvas/box-selection.ts` with `computeBoxSelection`, `computeBoxSelectionWithNodes`, `computeBoxSelectionLoads`
- Update imports in `structural-canvas.tsx` — no behavioral changes
- Validate: build + smoke test selection

**Checkpoint:** build green, app behaves identically. Commit.

### Phase 2 — Extract Pure Domain Utilities (Low Risk)

**2.1 diagram-utils.ts**
- Create `src/lib/diagram-utils.ts` with:
  - `perpWorld(ax, ay, bx, by)` (canvas line 67)
  - `memberPerpWorld()` (canvas line 769) — unify with perpWorld
  - `splitByZeroCrossings(samples)` — extract the 100-line algorithm duplicated in `drawShearDiagram` (lines 1223-1264) and `drawMomentDiagram` (lines 1389-1430)
- Replace inline definitions in `structural-canvas.tsx` with imports
- Validate: SFD and BMD render identically (visual comparison vs golden screenshot + fixture comparison)

**Checkpoint:** Commit.

### Phase 3 — Relocate Material Feature (Medium Risk — Many Imports)

**3.1 Move material code**
- `git mv src/features/material/compute.ts src/lib/sections/compute.ts`
- `git mv src/features/material/materials/ src/lib/sections/materials/`
- `git mv src/features/material/shapes/ src/lib/sections/shapes/`
- `git mv src/features/material/material-flyout.tsx src/tabs/model/tools/material/material-tool.tsx`
- `git mv src/features/material/{parametric-form,manual-form,advanced-panel,advanced-pill,shape-preview,section-select}.tsx src/tabs/model/tools/material/`

**3.2 Update imports** — these are the import paths to fix:
- `@/features/material/compute` → `@/lib/sections/compute`
- `@/features/material/materials/*` → `@/lib/sections/materials/*`
- `@/features/material/shapes/*` → `@/lib/sections/shapes/*`
- `@/features/material/material-flyout` → `@/tabs/model/tools/material/material-tool`
- All internal cross-imports within the moved files
- Specifically: `src/lib/model.ts` line 167 imports from `@/features/material/compute` — fix this

**3.3 Verify** — `npm run build` must pass. Use grep on `features/material` to confirm no stragglers.

**Checkpoint:** Commit. The `features/` folder is gone.

### Phase 4 — Split Flyout by Tab (Medium Risk)

This is the biggest readability win. Each tool's content component moves to its tab folder. The flyout-panel.tsx props interface **stays unchanged** in this phase — we're moving components, not changing signatures.

**4.1 Create per-tool files** in `src/tabs/{model,load,analyze}/tools/` mirroring the existing routing. Each file exports a single content component.

| Source (flyout-panel.tsx) | Destination |
|---|---|
| `ModifyComponentToolContent` (585-713) | `tabs/model/tools/select-tool.tsx` |
| `MoveNodeToolContent` (760-897) | `tabs/model/tools/move-node-tool.tsx` |
| `DeleteComponentToolContent` (715-758) | `tabs/model/tools/delete-tool.tsx` |
| `NodeToolContent` (899-907) | `tabs/model/tools/node-tool.tsx` |
| `MemberToolContent` (909-968) | `tabs/model/tools/member-tool.tsx` |
| `SupportToolContent` (970-1011) | `tabs/model/tools/support-tool.tsx` |
| `PointLoadToolContent` (1075-1223) | `tabs/load/tools/point-load-tool.tsx` |
| `DistributedLoadToolContent` (1225-1503) | `tabs/load/tools/dist-load-tool.tsx` |
| `ModifyLoadToolContent` + `DistributedLoadEditor` (1505-1752) | `tabs/load/tools/modify-load-tool.tsx` |
| `DeleteLoadToolContent` (1754-1792) | `tabs/load/tools/delete-load-tool.tsx` |
| `AnalyzeSelectContent` (1866-1918) | `tabs/analyze/tools/select-tool.tsx` |
| `ReactionToolContent` (1796-1864) | `tabs/analyze/tools/reaction-tool.tsx` |
| `DiagramToolContent` × 3 variants (1920-2072) | `tabs/analyze/tools/{axial,shear,moment}-tool.tsx` |
| `DeformationToolContent` (2074-2170) | `tabs/analyze/tools/deformation-tool.tsx` |

**4.2 Update `flyout-panel.tsx`** to import from new locations. The router in `FlyoutContent` still does the same switch — just now the components live elsewhere. Expected final size: ~200 lines.

**4.3 Pass-through props** — each per-tool file declares its own narrow Props interface receiving only what it needs. Example: `select-tool.tsx` takes `{ selection, activeSection, sections, onSectionChange, onModifySelection, onModifySupportSelection }` — not the 75-prop superset.

**4.4 Validate per tab**:
- Model tab: click each tool (NODE, MEMBER, SUPPORT, MATERIAL, SELECT, MOVE_NODE, DELETE), verify flyout renders correctly and accepts input
- Load tab: POINT_LOAD, DISTRIBUTED_LOAD (test all 4 mode×type combos), MODIFY_LOAD (test both point and distributed editing), DELETE
- Analyze tab: REACTION, AXIAL, SHEAR, MOMENT, DEFORMATION — scale sliders, invert toggles, label toggles

**Checkpoint:** Commit after each tab is moved (3 commits).

### Phase 5 — Split Canvas Draw Functions (Highest Risk)

The canvas is the riskiest because draw functions share viewport state. The mitigation: keep `structural-canvas.tsx` as the orchestrator — it still owns `panX`, `panY`, `zoom`, refs, and the `draw()` loop. Each draw function becomes a pure `(ctx, rect, deps) => void` exported from a tab folder.

**5.1 Define a `DrawContext` type** in `src/canvas/types.ts`:
```typescript
export interface DrawContext {
  ctx: CanvasRenderingContext2D
  rect: { width: number; height: number }
  zoom: number
  adaptiveView: boolean
}
```
Each draw function takes `(dctx: DrawContext, ...specificDeps)`.

**5.2 Extract shared draws first** (used by multiple tabs):
- `src/canvas/draws/grid.ts` ← `drawGrid`
- `src/canvas/draws/gizmo.ts` ← `drawGizmo`
- `src/canvas/draws/dimensions.ts` ← `drawDimensions`
- `src/canvas/draws/preview.ts` ← `drawPreview`
- `src/canvas/draws/glow.ts` ← `drawGlow`
- `src/canvas/draws/supports.ts` ← `drawSupports` (kept shared — used in deformed shape too)

**5.3 Extract per-tab draws:**
- `src/tabs/model/canvas/draw-members.ts` ← `drawMembers`
- `src/tabs/model/canvas/draw-nodes.ts` ← `drawNodes`
- `src/tabs/load/canvas/draw-loads.ts` ← `drawLoads`
- `src/tabs/analyze/canvas/draw-reactions.ts` ← `drawReactions`
- `src/tabs/analyze/canvas/draw-axial.ts` ← `drawAxialDiagram`
- `src/tabs/analyze/canvas/draw-shear.ts` ← `drawShearDiagram` (uses `splitByZeroCrossings` from diagram-utils)
- `src/tabs/analyze/canvas/draw-moment.ts` ← `drawMomentDiagram` (same)
- `src/tabs/analyze/canvas/draw-deformation.ts` ← `drawDeformedShape`
- `src/tabs/analyze/canvas/draw-deform-hover.ts` ← `drawDeformHover`

**5.4 Update `structural-canvas.tsx`** — `draw()` still orchestrates the same 15-function call order. Each call becomes:
```typescript
drawGrid({ ctx, rect, zoom, adaptiveView }, gridSpacing, panX, panY)
drawMembers({ ctx, rect, zoom, adaptiveView }, model, selection, activeTab, activeTool, hoveredMemberId)
// etc.
```

The file shrinks from 2703 to roughly 600-800 lines (event handlers, viewport state, draw orchestration).

**5.5 Move zoom slider** into `src/canvas/zoom-slider.tsx` — purely cosmetic, but it's ~100 lines of self-contained UI.

**5.6 Validate**:
- Load each of 5 templates (`template1` through `template5`)
- For each: switch to Analyze tab → REACTION, AXIAL, SHEAR, MOMENT, DEFORMATION → verify visually matches golden screenshot
- Test interactions: pan, zoom, snap, dimension toggle, hover glow
- Test box selection on Model and Load tabs
- Test move-node tool
- Compare `analysisResult` for templates 1 + 4 against committed fixtures — must be byte-identical

**Checkpoint:** Commit after each draw function is extracted (one commit per draw function = ~10 commits, but each is small and reversible).

### Phase 6 — Slim App.tsx (Full Scope, Done Last)

**6.1 Extract template modal handler** — the identical `onConfirm` closure is repeated 3 times in App.tsx (Beam/Frame/Truss modals). Extract `handleTemplateConfirm = (m: StructureModel) => { ... }` once.

**6.2 Extract `handleCanvasClick` per tool** — currently a 224-line if/else tree (lines 291-515). Split into per-tool factory functions:
```
src/tabs/model/handlers/
  ├── node-click.ts        # createNodeClickHandler(deps) => clickHandler
  ├── member-click.ts
  ├── support-click.ts
  └── move-node-click.ts
src/tabs/load/handlers/
  ├── point-load-click.ts
  ├── dist-load-click.ts
  └── modify-delete-click.ts
```

Each exports a factory that takes the closure dependencies and returns a `(worldX, worldY) => void` click handler. App.tsx becomes:
```typescript
const handleCanvasClick = useCallback((wx, wy) => {
  if (activeTab === "Model") {
    if (activeTool === "NODE") return nodeClickHandler(wx, wy)
    if (activeTool === "MEMBER") return memberClickHandler(wx, wy)
    // ...
  }
  // ...
}, [/* deps */])
```

**6.3 Extract `handleMouseMove` hover logic** to `src/canvas/use-hover-detection.ts` hook — currently 75 lines of tab/tool-conditional hit-testing in App.tsx (lines 188-263).

**6.4 Group state by tab into custom hooks**:
- `src/tabs/load/use-load-tool-state.ts` — owns active{Pt,Dist}* state and load selection
- `src/tabs/analyze/use-analyze-display-state.ts` — owns diagramScale, invertSFD/BMD, deformationScale, label toggles
- `src/tabs/model/use-move-node-state.ts` — owns moveNodeMode/CoordMode/SelectedId

Each hook returns `{ state, setters, handlers }` that App.tsx spreads into the relevant child components.

**6.5 Final App.tsx target: <300 lines** — root state (tab, tool, model, selection), modal state, tab-hook composition, top-level layout JSX.

**Checkpoint:** Commit per extraction. After Phase 6, run the full validation matrix again.

---

## Critical Files Modified

| File | Phase | Action |
|------|-------|--------|
| `src/components/flyout-panel.tsx` | 1, 4 | Atoms extracted → eventually thin router (~200 lines) |
| `src/components/structural-canvas.tsx` | 1, 2, 5 | Helpers extracted → eventually shell (~600 lines) |
| `src/App.tsx` | 6 | State grouped into hooks, click handler split (~300 lines) |
| `src/lib/model.ts` | 3 | Update line 167 import from `@/features/material/compute` |
| `src/features/material/*` | 3 | Moved to `src/lib/sections/` and `src/tabs/model/tools/material/` |

## Reused Utilities (No Reimplementation)

Verified existing utilities to reuse — do NOT recreate:

- `@/lib/geometry`: `hitTestNode`, `hitTestMember`, `findNodeAt`, `pointSegDist`, `snapWorld`, `addNode`, `splitMember`, `worldToScreen`, `screenToWorld`, `axisCenter`, `SCALE`, `GRID`, `SNAP`
- `@/lib/model`: `emptySelection`, `mergeSelection`, `removeFromSelection`, `deleteMultiSelection`, `deleteNode`, `deleteMember`, `stabilityOf`
- `@/lib/solver`: `analyze`, `memberInternalForces`
- `@/lib/constants`: ALL color and dimension constants
- `@/lib/flyout-panel-colors`: `FLYOUT_PANEL_COLORS`
- `@/lib/units`: `UnitSettings`, `displayGridSpacing`, `parseGridSpacing`, `labelGridSpacing`

---

## Validation (Independent Smoke Test Plan)

Run after every phase without user intervention. Combines automated checks and a deterministic manual checklist executed against the running dev server.

### Automated Checks (per commit)

1. **TypeScript** — `npm run build` must complete with **zero** errors. This is the hard gate.
2. **Lint** — `npm run lint` must show no new errors vs baseline.
3. **Format** — `npm run format:check` must pass.
4. **Import sanity** — `grep -r "features/material" src/` returns empty after Phase 3.
5. **No orphaned exports** — for each moved component, grep the new path is referenced and the old path is not.

### Smoke Test Matrix (deterministic)

Done by starting `npm run dev` and visiting localhost:5173. Each row produces a binary pass/fail:

| Step | Action | Expected |
|------|--------|----------|
| S1 | Load app | Default beam (template1) renders with 3 nodes, 2 members, pin+roller, 10kN load at midspan |
| S2 | Click Model→NODE, click empty canvas | New node appears at snapped position |
| S3 | Click Model→MEMBER, click two nodes | Member created between them, type matches activeMemberType |
| S4 | Click Model→SUPPORT, click node | Support glyph appears matching activeSupportType |
| S5 | Click Model→MATERIAL | Material flyout opens, parametric form renders |
| S6 | Click Model→SELECT, draw box around members | Selection highlights, flyout shows count |
| S7 | Click Model→MOVE_NODE, switch to screen mode, drag node | Node moves with cursor |
| S8 | NavBar → File → Templates → Beam | Beam modal opens, confirm creates beam |
| S9 | NavBar → Examples | Modal opens with 5 SVG cards |
| S10 | Switch to Load tab, POINT_LOAD, click node | Load arrow appears with current magnitude |
| S11 | DISTRIBUTED_LOAD, asymmetric mode, global-axis Y | Load trapezoid renders, arrows point in Y direction |
| S12 | MODIFY_LOAD, click distributed load | Editor opens with current values |
| S13 | Switch to Analyze tab | REACTION tool auto-selected, reaction arrows appear |
| S14 | AXIAL diagram | Blue/red diagram offsets perpendicular to members |
| S15 | SHEAR diagram | SFD renders, invert toggle flips it |
| S16 | MOMENT diagram | BMD renders, invert toggle flips it |
| S17 | DEFORMATION | Deformed shape renders, hover over node shows tooltip |
| S18 | Load template4 (PortalLateral) | Vertical members show diagrams on correct side |
| S19 | Pan with middle mouse / drag canvas | View pans smoothly |
| S20 | Wheel zoom | Zooms toward cursor, snaps at 0.5/1/2x |
| S21 | Toggle dimensions, snap to grid, snap to node | Behaviors match pre-refactor |

### Contingency: Visual Regression Without Screenshots

1. **Loading template4 (PortalLateral)** is the "canary" — exercises vertical members, distributed loads in global axis, all three diagrams, and reactions on all three support types. If S18 passes, 80% of canvas logic is verified.
2. **Numerical truth** — committed fixtures of `analysisResult` for template1 and template4 must remain byte-identical after refactor. Any divergence = wiring bug (solver itself is not being touched).
3. **Console errors** — open DevTools, check console is clean. Any React warning (key, hooks order, ref) means a regression.

### Failure Recovery

- If any phase fails its smoke test: `git reset --hard HEAD~1` to roll back the last commit, diagnose with smaller test cases, retry.
- Phase boundaries are git commit boundaries. Worst case lost work = one phase.
- The branch is `refactor/tab-structure`. `main` is never touched during the refactor.

### Pre-Flight Checklist Before Starting

- [x] Confirm `npm run build` passes on `main` (PASS — 5.12s, bundle 562 KB)
- [x] Record `npm run lint` baseline on `main` — **1 pre-existing error** in `structural-canvas.tsx:2089` (`prefer-const` on `newZoom`), **14 warnings** (mostly `react-refresh/only-export-components` in material forms). Refactor must not regress this count.
- [x] Create `refactor/tab-structure` branch from `main`
- [ ] ~~Capture `analysisResult` JSON fixtures~~ — **deferred.** No TS runner installed (`tsx`/`vite-node`) and codebase uses `@/` path aliases incompatible with raw Node. Building fixture tooling adds risk without proportional benefit because `solver.ts` is in the "do not touch" set. Mitigation: visual smoke check on template4 (canary) plus comparing on-screen numeric tables before/after refactor.

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Hidden coupling in `handleCanvasClick` closures breaks tool behavior | Medium | Phase 6 (the split) is last; until then, App.tsx is unchanged |
| Canvas draw function reorder changes visual output | Low | Phase 5 keeps the exact `draw()` call order — only extracts function bodies |
| Material flyout breaks due to import path changes | Medium | Phase 3 only renames; no logic changes. Build is the gate. |
| `flyout-panel.tsx` prop interface drift in Phase 4 | Low | Explicitly: do not change prop signatures in Phase 4. Each tool file receives a narrower subset, but the parent still passes the full set. |
| Diagram split (`splitByZeroCrossings`) introduces subtle off-by-one | Medium | Extract from existing code verbatim, do not "improve". Numerical fixture comparison catches divergence. |
| `lib/model.ts` cyclic import with `lib/sections/compute.ts` | Low | The existing local-require pattern (line 167 comment) is preserved during move. |

---

## Execution Skills/Tools Used

- **`typecheck` skill** — after each phase to catch type errors fast
- **`verify` skill** — runs build + starts dev server, used at phase checkpoints
- **`Explore` agent** — already used; can re-deploy mid-refactor if new questions emerge
- **`simplify` skill** — run at the end of Phase 5 and Phase 6 to clean up any obvious leftovers

---

## Out of Scope (Defer to Later)

These were tempting but explicitly deferred to keep this refactor purely structural:

- Unifying `DistributedLoadToolContent` and `DistributedLoadEditor` (Phase 4 keeps them separate; consolidation is a Phase 7 follow-up)
- Extracting `ModeToggle` shared component (8 toggle button instances) — visual change risk vs. code dedup; punt to feature work
- Replacing prop-drilling with React Context — adds a layer of indirection that future contributors may regret; keep explicit props
- Memoization / performance work — current perf is acceptable; don't conflate with structural refactor
- Adding tests — out of scope for refactor; smoke checklist suffices for behavior preservation

After this refactor lands, Load Cases & Combinations becomes: create `src/tabs/load-cases/` with its own tools/ and canvas/ folders, add to the tab enum, done.
