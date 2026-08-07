# DESIGN_RULES.md — OpenANSTRUK-2D Member Design Engine (Core)

This document narrates **what the Design tab actually does** — the engineering
logic, the governing code clauses, and the assumptions behind every number it
produces. It is the authoritative reference for the `src/lib/design/` domain
modules.

The engine is split along two axes: a **material-agnostic core** and **per-
material strategies**. This file covers the core — what is designable, how a
member is classified as beam or column, where demands come from, how the run is
orchestrated, and how results reach the canvas. The engineering clause math
lives in one document per material.

| Document | Covers | Sections |
|---|---|---|
| **DESIGN_RULES.md** (this file) | Core: designability, element-type resolution, demands, orchestration, results, extension guidance, limitations | §1–§4, §10, §12, §13 |
| [**DESIGN_RC.md**](DESIGN_RC.md) | Reinforced concrete — ACI 318-25 / SNI 2847:2019. Flexure, P–M columns, shear, bar layout, detailing, per-code rule tables | §5–§9, §11, §12.1–§12.2 |
| [**DESIGN_STEEL.md**](DESIGN_STEEL.md) | Structural steel — AISC 360-16 / SNI 1729:2020. Classification, axial, flexure + LTB, shear, Chapter H interaction | §S1–§S14 |

> **Section numbers are one shared namespace across the three files**, so a
> citation like "§5b.5" or "§S10" resolves to exactly one place regardless of
> which document it was written in. Numbering was preserved through the split, so
> references written before it still work.

**Materials implemented today:** reinforced concrete (rectangular beams and
columns, circular columns) and structural steel (IWF, RHS, CHS, tee, single
angle — equal *and* unequal legs). A mixed concrete + steel model is designed in
a single run — the orchestrator dispatches each member to its material's strategy
by `section.materialClass`.

---

## 1. Design philosophy

The design engine is a **pure-domain layer** (no React) under `src/lib/design/`.
It consumes the analysis results — the same DSM solver that drives the Analyze
tab — plus a small set of user-supplied *design criteria* and *per-section
inputs*, and produces a `MemberDesignResult` per member.

Three rules govern the whole engine.

**Demand is exact.** Internal forces come from closed-form polynomials rather
than a sampling grid ([§4](#4-demands)), so a moment extremum is found by solving
for it, not by hoping a station landed near it.

**Capacity is explicit.** Every capacity traces to a clause, computed from first
principles — strain compatibility, the Whitney block, an effective width — never
a lookup table. Every engineering formula cites its clause in a comment, and
where it anchors a known worked example it also carries a `validation/`
assertion.

**A wrong answer is worse than no answer.** Where a section falls outside the
clauses actually implemented, the engine **refuses it** and says why, rather than
letting a formula answer outside its stated scope. Refusals surface as run
issues, never silently ([§S10](DESIGN_STEEL.md#s10-refusals--sections-the-engine-declines-to-design)
lists the steel cases).

---

## 2. Module map & data flow

```
src/lib/design/
├── core/                       material-agnostic
│   ├── types.ts                DesignMaterial, FrameType, ElementType, ZoneId,
│   │                           result types (ZoneFlexureResult, ZoneShearResult,
│   │                           ColumnDesignResult, SteelDesignResult,
│   │                           MemberDesignResult, JointCheckResult), DesignReport
│   ├── criteria.ts             DesignCriteria { material, rc, steel } wrapper
│   ├── section-input.ts        SectionDesignInput union + defaultSectionDesignInput
│   │                           (dispatched by materialClass) + asRcInput/asSteelInput
│   ├── designability.ts        DESIGN_SUPPORT registry + isSectionDesignable + materialOf
│   ├── demands.ts              zoneRanges, zoneExtremes (analytic), envelope,
│   │                           frame moment minimums, collectPMPairs, buildGravityCombo
│   └── run-design.ts           runDesign() orchestrator — solve → combine →
│                               envelope → dispatch per member to a strategy
├── rc/                         reinforced concrete — see DESIGN_RC.md
│   ├── criteria.ts             RcCriteria { code, … } + defaultRcCriteria
│   ├── types.ts                RebarArrangement, ColumnArrangement, RcSectionInput
│   ├── strategy.ts             designMemberRc() — resolves code module, runs beam/column
│   ├── shared/                 GEOMETRY + DATA — code-agnostic, single-sourced
│   │   ├── rebar.ts            Metric bar catalogue D10–D32 (db, area)
│   │   ├── bar-geometry.ts     buildBarLayout(), layering, maxSideBars
│   │   ├── column-grid.ts      nx×ny perimeter grid / circular ring, layoutToColumnBars
│   │   └── types.ts            ColumnGeom, ColumnBar, ArrangementCheck, TransverseChecks
│   └── codes/                  THE MATH — duplicated per code edition
│       ├── index.ts            getRcCode(code) registry, RcCode, RC_CODE_LABELS
│       ├── aci318-25/          rules, beam, column, report, index
│       └── sni2847-19/         ACI 318-14 baseline (default code)
└── steel/                      structural steel — see DESIGN_STEEL.md
    ├── criteria.ts             SteelCriteria + defaultSteelCriteria
    ├── types.ts                SteelSectionInput (elementType, Lb, Cb, K33, K22)
    ├── rules.ts                steelGeom + Table B4.1a/B4.1b classification
    ├── compression.ts          E3 flexural, E4 torsional/flexural-torsional,
    │                           E7 effective width/area, D2 tension
    ├── flexure.ts              F2/F3 (I-shape + LTB), F7 (box), F8 (round),
    │                           F9 (tee, SIGN-dependent), F10 (angle, principal axes)
    ├── shear.ts                G2 / G3 (tee + angle) / G4 / G5
    ├── interaction.ts          H1-1a / H1-1b / H1-2, H1.3 alternative,
    │                           H2-1 (unsymmetric — every angle, hogging tees)
    ├── section-props.ts        Section → clause inputs; shared with the UI decks
    └── strategy.ts             designMemberSteel() — station sweep
```

Steel needs **no `codes/<code>/` split**: SNI 1729:2020 is an adopted translation
of AISC 360 with no formula deltas that reach the engine. RC does need one,
because ACI 318-25 and SNI 2847:2019 genuinely diverge
([§5c](DESIGN_RC.md#5c-code-edition-deltas)).

**Flow (`runDesign`):**

```
enabled combinations ──► solveAllCases() ──► combineResults() per combo
                                                   │
        buildGravityCombo (1.2D+1.0L) ─────────────┤ (for RC IMF/SMF Vg)
                                                   ▼
   for each member:
     isSectionDesignable? ─no─► status "not-designable"
        │yes
     envelopeMemberDemands (raw zone demands, Pu)
        │
     dispatch by section.materialClass:
        ├─ steel ─► designMemberSteel():
        │             scope probe ─fail─► "not-implemented" + note
        │             axial / shear capacities (station-independent)
        │             11 stations x every combo ─► worst H1 ratio
        │             ▼ SteelDesignResult
        └─ rc ────► designMemberRc():
                      resolve beam vs column (orientation + axial gate)
                        ├─ column ─► P–M interaction ──► ColumnDesignResult
                        └─ beam ───► applyFrameMomentMinimums
                                     FLEXURE per zone  ─► provides As / capacity
                                     SHEAR per zone (needs flexural steel for Ve)
        ▼
     MemberDesignResult (tagged with `material`)
        │
     post-pass: SMF strong-column-weak-beam over joints ─► DesignRunResult.joints
     post-pass: refusal notes + failures ────────────────► DesignRunResult.issues
```

`runDesign()` calls `solveAllCases` + `combineResults` **itself** — it does *not*
reuse the Analyze tab's lazy memo, so design works regardless of which tab is
active.

Every refusal carries a `MemberDesignResult.note`, and `run-design.ts` promotes
each one into `issues`. A member that simply vanishes from the results reads as a
bug, so it never does.

---

## 3. Applicability & qualification

### 3.1 Designable sections (`core/designability.ts`)
`isSectionDesignable()` consults the **`DESIGN_SUPPORT`** registry — the target
matrix of (material × geometry × element type), each row flagged `implemented`.
A section is designable when its material + geometry maps to an **implemented**
entry whose strength and dimensions check out. Implemented today:

| Material | Geometry | Beam | Column | Live gate |
|---|---|---|---|---|
| Concrete | `rect` | ✅ | ✅ | `strength.fc > 0`, `dims.b > 0`, `dims.h > 0` |
| Concrete | `circle` | — | ✅ | `strength.fc > 0`, `dims.d > 0` (column-only) |
| Steel | `iwf` | ✅ | ✅ | `Fy > 0`, `E > 0`, `A > 0`, `derived.{S33b, Z33, r22} > 0` |
| Steel | `rhs` | ✅ | ✅ | as above |
| Steel | `chs` | ✅ | ✅ | as above |

Planned-but-unbuilt combinations — RC tee, steel single angle — are listed in the
registry with `implemented: false`, so they render `status: "not-designable"` and
show as "N.A." in the picker rather than crashing. Enabling one is a data edit
(flip the flag) plus its strategy branch. `materialOf(section)` maps
`concrete → "rc"` and `steel → "steel"`, and routes the orchestrator's dispatch.

Designability is a *static* gate on the section. A section can pass it and still
be refused per member once the clause scope is known — an IWF with a noncompact
web passes here and is refused in the strategy
([§S10](DESIGN_STEEL.md#s10-refusals--sections-the-engine-declines-to-design)).

### 3.2 Beam vs column (element-type resolution)
Each section carries an **Element Type** — `auto` (default), `beam`, or `column`
— resolved **per member** in `runDesign` (`resolveElementType`):

- explicit `beam` / `column` is honoured;
- `auto` → **vertical** members (`|Δy| > |Δx|`) design as columns, **horizontal**
  as beams, but **any** member is **promoted to column** when the factored axial
  compression reaches the gate:

```
Pu ≥ 0.1 · f'c · Ag        (Ag = b·h)      → column
```

The solver's axial sign is **tension-positive**, so `Pu = −Nmin` (the most
compressive value across the envelope). A member explicitly **forced** to beam
while carrying `Pu ≥ 0.1 f'c Ag` is out of beam scope → `status: "axial-exceeded"`.

### 3.3 Orientation independence
Design applies to **every** qualifying member regardless of orientation. A 2D
plane frame has no torsion DOF, so pure **M + V** design is *exact* in 2D — there
is no St-Venant torsion to scope out. The cost is a labelling convention
([§3.4](#34-tensioncompression-faces--local-2)).

### 3.4 Tension/compression faces ≡ ±local-2
"Top" and "bottom" bars map to the member's **+local-2 / −local-2** faces, not
gravity-up/down (local-2 = local-1 rotated +90° CCW; see the solver sign
conventions in `CLAUDE.md`). Consequences:
- `MuPos` (sagging) puts the **−local-2** fibre (bottom) in tension.
- `MuNeg` (hogging) puts the **+local-2** fibre (top) in tension.
- For vertical/inclined members this is the *local* frame — consistent with the
  side on which the SFD/BMD render, but not necessarily physical "up".

---

## 4. Demands

All of this lives in `core/demands.ts` and is **material-agnostic**: RC reads the
per-zone extremes directly, and steel reuses `PuMaxCompression` for its axial
gate while sampling its own stations ([§S9](DESIGN_STEEL.md#s9-demands-stations-and-the-design-run)).

### 4.1 Three zones per member
| Zone | Range along the member (length L, section height h) |
|------|------|
| `end-i` | `[0, min(2h, L/2)]` |
| `midspan` | between the two end zones |
| `end-j` | `[max(L − 2h, L/2), L]` |

The `2h` end-zone length matches the seismic hinge region (18.6.4 / 18.4.2). For
short members (`L ≤ 4h`) the midspan zone degenerates to the single point `L/2`
— never a negative width.

### 4.2 Exact analytic extremes (`zoneExtremes`)
Internal forces inside a member are cubic in `x` (closed form, from
`memberInternalForces` in `solver.ts`):

```
N(x) = N1 − qx1·x − (qx2 − qx1)·x²/(2L)
V(x) = V1 − q1·x  − (q2 − q1)·x²/(2L)
M(x) = M1 − V1·x  + q1·x²/2 + (q2 − q1)·x³/(6L)
```

Extremes within a zone are found from the **candidate set**, not a sampling grid:
- zone boundaries;
- roots of `V(x) = 0` (quadratic; linear when `q1 == q2`) → M extrema;
- root of `q(x) = 0` → V extreme;
- root of `qx(x) = 0` → N extreme.

Each candidate is evaluated with the closed-form polynomials. Result per zone:
`{ Mmax, Mmin, Vabs, Nmin, Nmax }`.

### 4.3 Envelope across combinations (`envelopeMemberDemands`)
Each **enabled** load combination is solved and combined; the per-zone extremes
are enveloped across all of them. The governing combo id is recorded per zone
for traceability. Combos whose cases failed to solve are skipped and reported in
`issues` — a partial set is never silently enveloped.

`MuPos` = max sagging, `MuNeg` = min (most hogging, ≤ 0). `PuMaxCompression`
tracks the axial gate.

### 4.4 Frame-type moment minimums (`applyFrameMomentMinimums`)
After enveloping, code minimums are layered on:

| Frame | Rule | Clause |
|-------|------|--------|
| **SMF** | M⁺ at a joint face ≥ ½ M⁻ there; min M at any section ≥ ¼ max M at either joint | 18.6.3.2 |
| **IMF** | M⁺ at a joint face ≥ ⅓ M⁻ there; min M at any section ≥ ⅕ max M at either joint | 18.4.2.2 |
| **OMF** | none | — |

### 4.5 Gravity combo for capacity-design shear (`buildGravityCombo`)
IMF/SMF shear adds the *gravity* shear `Vg` to the capacity-design term. `Vg`
comes from an internal synthesized combination **1.2 D + 1.0 L**, assembled by
matching load-case `kind` (Dead/Live, self-weight included via its `Dead` kind).
This combo is never shown to the user — it exists only to feed `Ve`.


---

## 10. Results & visualization

- **Member colour** = worst flexural `D/C` (checked) via `designColorForDC` in
  `constants.ts`: navy `[0, 0.33)`, green `[0.33, 0.66)`, orange `[0.66, 1.0)`,
  red `≥ 1.0`. Required mode: binary navy (adequate) / red (inadequate).
- **Shear** is binary navy/red, surfaced via its label.
- **Two rotated pill labels** per designed member at mid-span — flexure on the
  **+local-2** side, shear on **−local-2** (the same sides the diagrams use).
- A **colour-legend** card appears bottom-right when results exist.
- Run issues (no combos, failed cases, no designable members) render in an amber
  card under the Run button.

---

## 12. Extending the engine

The pipeline (`runDesign` → demands → per-material strategy) is
material-agnostic in its *shape*. Adding capability means adding strategies, not
rewriting the orchestrator. Extension guidance is split by what you are adding:

| Adding… | See |
|---|---|
| A new concrete section shape (T, L, hollow) | [§12.1](DESIGN_RC.md#121-new-concrete-section-shapes-t-l-hollow) |
| Circular columns — the worked template for a new shape | [§12.1b](DESIGN_RC.md#121b-circular-columns-v113) |
| Concrete column capability | [§12.2](DESIGN_RC.md#122-columns-axial--in-plane-flexure--implemented) |
| Steel shapes, clauses, or seismic provisions | [§S13](DESIGN_STEEL.md#s13-not-implemented--deferred-scope) |
| A new **material** entirely | §12.3 below |
| A new **code edition** | §12.4 below |

### 12.3 Adding a new material

Steel is the worked example — it went from stub to implemented without the
orchestrator changing shape. The pattern:

1. **Add the strategy folder** `src/lib/design/<material>/` with its own
   `criteria.ts`, `types.ts` and a `designMember<Material>()` entry point taking
   the same input envelope every strategy receives (`memberId`, `section`, `L`,
   `di`, `cr`, `efByCombo`, `raw`, `Pu`, `isVertical`).
2. **Extend the result type.** Add a `<Material>DesignResult` interface in
   `core/types.ts` and hang it off `MemberDesignResult` as an optional field
   beside `.column` and `.steel`. Existing materials are unaffected.
3. **Register designability.** Add rows to `DESIGN_SUPPORT` for each
   (geometry × element) combination, `implemented: false` until the strategy
   exists. `isSectionDesignable` gates on the flag, so a planned-but-unbuilt
   combination shows "N.A." in the picker instead of crashing.
4. **Dispatch.** One branch in `core/run-design.ts` keyed on
   `materialOf(section)`. The demand machinery in `core/demands.ts` is reused
   unchanged — a new material reinterprets zones as it likes (steel treats them
   as check stations) without touching them.
5. **Reuse the canvas.** Populate `worstFlexureDC` and `worstShearPass` and the
   member colours, pills and legend work with no canvas-layer branching on
   material.
6. **Surface refusals.** Anything the strategy cannot design returns
   `status: "not-implemented"` with a `note`, which `run-design.ts` promotes into
   `issues`.

The UI mirrors the **material × element** axis only — never per-code. A code
edition is a criteria dropdown, not a folder of components.

### 12.4 New design codes

RC is already parameterised by edition: `RcCriteria.code` selects a module from
the `rc/codes/` registry, and each module owns its own clause math. Adding an
edition means adding a folder that exports the same named functions — `rules`,
`beam`, `column`, `report` — and registering it in `getRcCode`. The clause
*structure* is shared across ACI and SNI, so a new edition is mostly a diff
against the closest existing one; Eurocode 2 would need more formula overrides
but the same shape.

Steel has no such split today, and should not gain one speculatively. If a
future edition genuinely diverges, mirror the RC pattern —
`steel/codes/<code>/` with a registry — rather than branching inline.

> **Guiding rule for contributors:** keep `core/run-design.ts`, `rc/strategy.ts`
> and `steel/strategy.ts` as thin orchestrators. Material- and shape-specific
> physics belong in the strategy modules — RC clause math in
> `rc/codes/<code>/{beam,column}.ts`, code-agnostic geometry in `rc/shared/`,
> steel clause math in `steel/{rules,compression,flexure,shear,interaction}.ts`
> — and *every* engineering formula must cite its clause in a comment and, where
> it anchors a known example, gain a `validation/` assertion.

---

## 13. Known limitations

Cross-cutting limits of the engine as it stands. Material-specific gaps are
listed in [§S13](DESIGN_STEEL.md#s13-not-implemented--deferred-scope) (steel,
with reasons) and throughout [`DESIGN_RC.md`](DESIGN_RC.md).

**Both materials**

- **Design state is App-state only.** `designCriteria`, `sectionDesignInputs` and
  `designResult` are *not* part of `StructureModel` and are *not* saved by JSON
  Save/Load — the same boundary as load cases and combinations. Reopening a saved
  model restores the structure but not its design setup.
- **`Ln` = node-to-node length.** No column-face offset for the clear span, so
  capacity-design shear and slenderness use a slightly conservative length.
- **Top/bottom ≡ ±local-2**, not gravity-up ([§3.4](#34-tensioncompression-faces--local-2)).
  For vertical and inclined members this is the *local* frame — consistent with
  the side the SFD/BMD render on, but not necessarily physical "up".
- **One bending axis.** A 2D frame element has a single bending DOF, so biaxial
  bending cannot be modelled or checked. This is a permanent boundary of the
  model, not a deferred feature.
- **First-order analysis.** No `P-Δ` or `P-δ` amplification anywhere. Sway-
  sensitive frames need externally amplified demands.
- **No live UI smoke test for steel.** None of the five static examples uses a
  steel section, so exercising the steel tab requires authoring one in the
  MATERIAL tool.

**Reinforced concrete**

- **Rectangular beams; rectangular and circular columns.** Other shapes deferred
  ([§12.1](DESIGN_RC.md#121-new-concrete-section-shapes-t-l-hollow)).
- **OMF/IMF unanchored.** They share the SMF-validated engine but lack a separate
  published-example check. The beam anchor is Contoh 5-A/5-B (SMF) and the column
  anchor Contoh 5-C (SMF capacity).
- **Column D/C is radial-to-origin** against the closed φ-polygon, with demand
  pairs sampled at candidate stations.
- **Deferred:** sway (δs) / computed-k slenderness, biaxial out-of-plane bending,
  column lap-splice and development detailing.
- **Assumed inputs, not tracked:** aggregate size `d_agg = 25.4 mm` in the 25.2.1
  clear-spacing check; sheltered cast-in-place exposure (40 mm cover) in 24.3.2 /
  20.6.1.3.1.

**Steel**

- **IWF, RHS and CHS only** — single angle is deferred, and the parametric IWF is
  treated as **built-up** throughout (hence `kc` and φv = 0.90).
- **Noncompact- and slender-web I-shapes are refused**, not approximated (AISC
  F4/F5 unimplemented).
- **`Cb` falls back to 1.0** whenever a user enters `Lb` shorter than the member,
  because there is no intermediate-brace concept to locate the segment
  ([§S6.2](DESIGN_STEEL.md#s62-cb-policy-f1-1)).
- **`K = 1.0`** by default (Direct Analysis Method); no sway nomograph.
- **No AISC 341-16 seismic detailing.** `SteelCriteria.frameType` is deliberately
  left without UI so it cannot imply a check that does not run.

---

*Cross-references:* reinforced-concrete clause math is in
[`DESIGN_RC.md`](DESIGN_RC.md); steel clause math is in
[`DESIGN_STEEL.md`](DESIGN_STEEL.md). Solver sign conventions and the analysis
pipeline are in [`CLAUDE.md`](../CLAUDE.md) and
[`docs/ARCHITECTURE.md`](ARCHITECTURE.md); the user-facing walkthrough is in
[`docs/USER_GUIDE.md`](USER_GUIDE.md).
