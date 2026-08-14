# DESIGN_RULES.md — OpenANSTRUK-2D Member Design Engine (Core)

This document narrates **what the Design tab actually does** — the engineering
logic, the governing code clauses, and the assumptions behind every number it
produces. It is the authoritative reference for the `src/2d/lib/design/` domain
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

The design engine is a **pure-domain layer** (no React) under `src/2d/lib/design/`.
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
src/2d/lib/design/
├── core/                       material-agnostic
│   ├── types.ts                DesignMaterial, FrameType, ElementType, ZoneId,
│   │                           result types (ZoneFlexureResult, ZoneShearResult,
│   │                           ColumnDesignResult, SteelDesignResult,
│   │                           MemberDesignResult, JointCheckResult), DesignReport
│   ├── criteria.ts             DesignCriteria { rc, steel } wrapper
│   ├── section-input.ts        SectionDesignInput union + defaultSectionDesignInput
│   │                           (dispatched by materialClass) + asRcInput/asSteelInput
│   ├── designability.ts        DESIGN_SUPPORT registry + isSectionDesignable + materialOf
│   ├── demands.ts              zoneRanges, zoneExtremes (analytic), envelope,
│   │                           frame moment minimums, collectPMPairs, buildGravityCombo
│   └── run-design.ts           two-stage orchestrator: solveDesignCases() (the
│                               factorization) then designFromCases() (combine →
│                               envelope → dispatch per member to a strategy);
│                               runDesign() composes both
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
    ├── criteria.ts             SteelCriteria (code, frameType, Fy/Fu/E, φ)
    ├── types.ts                no per-section input — documents why
    ├── member-role.ts          inferSteelRole — beam/column/brace from geometry
    ├── rules.ts                steelGeom + Table B4.1a/B4.1b classification
    ├── compression.ts          E3 flexural, E4 torsional/flexural-torsional,
    │                           E7 effective width/area, D2 tension
    ├── flexure.ts              F2/F3 (I-shape + LTB), F7 (box), F8 (round),
    │                           F9 (tee, SIGN-dependent), F10 (angle, principal axes)
    ├── shear.ts                G2 / G3 (tee + angle) / G4 / G5
    ├── interaction.ts          H1-1a / H1-1b, H2-1 (unsymmetric — every angle,
    │                           hogging tees). H1.3 deliberately NOT implemented
    ├── seismic.ts              AISC 341 Table D1.1 ductility, D1.2 bracing,
    │                           E3.4a SCWB. Inert for OMF/RMB
    ├── section-props.ts        Section → clause inputs; shared with the UI decks
    └── strategy.ts             designMemberSteel() — station sweep
```

Steel needs **no `codes/<code>/` split**: SNI 1729:2020 adopts AISC 360-16 and
SNI 7860 adopts AISC 341-16, with no formula deltas that reach the engine, so
`SteelCriteria.code` is a labelling axis only. RC does need one,
because ACI 318-25 and SNI 2847:2019 genuinely diverge
([§5c](DESIGN_RC.md#5c-code-edition-deltas)).

**Flow (`runDesign` = `solveDesignCases` then `designFromCases`):**

```
        ── stage 1 ──┐                    ┌── stage 2 ─────────────────────────
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

**Why the stages split there.** `solveAllCases` is the only expensive step — one
stiffness factorization per enabled case — and it depends on nothing but the
model, the cases and the shear-deformation flag. Everything after it is linear
algebra over already-solved cases plus per-member clause work, and *that* is
what the criteria and section inputs feed.

Since v1.2.0 the Design tab has no Run button and recomputes on every input
change, so this boundary is what keeps a rebar keystroke off the solver: only
`designFromCases` re-runs. The UI drives the two stages separately and hands
stage 2 the same solved-cases memo the Analyze tab uses, so switching between
those tabs reuses the factorization instead of repeating it. `runDesign()`
composes both stages for callers holding no cache — the validation suites, for
instance.

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

Steel `tee` and `angle` are implemented too (AISC F9 / F10 + E4 + H2). The one
planned-but-unbuilt combination is the **RC tee**, listed in the registry with
`implemented: false`, so it renders `status: "not-designable"` and shows as
"N.A." in the picker rather than crashing. Enabling it is a data edit (flip the
flag) plus its strategy branch. `materialOf(section)` maps `concrete → "rc"` and
`steel → "steel"`, and routes the orchestrator's dispatch.

Designability is a *static* gate on the section. A section can pass it and still
be refused per member once the clause scope is known — an IWF with a noncompact
web passes here and is refused in the strategy
([§S10](DESIGN_STEEL.md#s10-refusals--sections-the-engine-declines-to-design)).

### 3.1b Which sections a tool *offers* (`assignedSectionIds`)

Designability answers *can this section be designed*. It does not answer *is
there anything to design*, and the two came apart in the UI: the material
flyouts listed every designable section in the catalogue, including ones no
member carried. Selecting such a section opened a pane with no members, no
demands and no result — which the pane then had to explain, at length. That is
how the steel flyout came to spend more space apologising than reporting.

`assignedSectionIds(model)` returns the sections at least one member carries.
Both material tools intersect it with their own rule:

| Tool | Offers |
|---|---|
| **RC** | `materialOf === "rc"` ∧ `isSectionDesignable` ∧ assigned |
| **Steel** | `materialOf === "steel"` ∧ assigned |

Steel deliberately keeps its **non-designable** sections visible, with a one-line
note saying why — a steel shape that is in the target matrix but unbuilt is
information the user wants. RC has no equivalent state worth showing.

Two consequences worth stating, because both are load-bearing:

**The panes derive their section, they do not trust the prop.**
`designSelectedSectionId` is a single piece of App state shared by both material
tools, and it survives deleting the last member that used it — so it routinely
points at a section the pane must not render. Each pane resolves it (`keep the
selection if this tool offers it, else fall back to the first it does`) and
writes the resolved id back through an effect. Deriving rather than waiting for
the effect is what makes the *first* rendered frame correct. It also closed a
latent bug: the RC pane's old guard was `sections[id]` + `isSectionDesignable`,
both of which a steel IWF satisfies, so a shared selection could draw the rebar
editor and cross-section preview on a 200×400 "concrete" section.

**The context strip mirrors the same rule** (`resolveSectionFor` in
`flyout-panel.tsx`). Its whole job is to name the section the user will land on;
filter the panes without filtering it and it advertises a section that is not in
the picker below it.

**Both panes refuse in the same shape.** When a tool offers nothing, it returns a
single line naming the cause and nothing else — no picker, no group header, no
verdict. RC used to wrap that message inside its `Section & Type` card, which
left a dropdown on screen that could not be opened onto anything, beneath a
verdict reading `none`. The early return sits **after every hook**, never before
one; hoisting it above them would change hook order between renders.

Asserted in `validation/design_section_offer_smoke.mts`, with the unassigned
section listed **first** in every fixture catalogue — so a pane that lost the
filter would fall back to it and the suite would fail rather than pass by
accident. The empty states are asserted by **exact equality**, since `includes`
would not notice the furniture returning around the message.

### 3.2 Beam vs column (element-type resolution)

**Why the type is a property of the SECTION.** A concrete section's
reinforcement definition *is* its design type: a column takes a perimeter bar
grid and ties, a beam takes top/bottom/side bars and stirrups. Those are
different data, not two views of one thing — so the choice belongs where the
rebar is defined. This is also what ETABS does ("P-M2-M3 Design (Column)" vs
"M3 Design Only (Beam)" in the section dialog), and it matches how engineers
work: `C1 500×500` and `B1 300×500` are defined separately rather than one
section reused as both.

**Steel is the opposite, deliberately.** Nothing per-section differs between a
steel beam and a steel column, and the same IWF genuinely serves as both, so
steel infers a per-**member** role from geometry (`steel/member-role.ts`) with no
control at all. The asymmetry between the two tools is principled; it is not an
oversight to be tidied into consistency.

The rule lives in `core/element-type.ts` and is edited in two places, both
writing the same field: the Model tab's **MATERIAL** tool (beside the section's
dimensions) and the Design tab's **DESIGN SCHEDULE**. The RC design flyout shows
it read-only — a third editor would just be somewhere else to look.

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
An explicit choice is **never** silently promoted: the user said beam, so the
honest answer is a refusal, not a formulation they did not ask for.

`sectionAutoLabel(model, sectionId)` reports what `auto` resolves to — `Beam`,
`Column`, `mixed`, or `—` — from **orientation alone**, because both editors must
answer identically and the MATERIAL flyout runs in the Model tab where no design
result exists. The axial gate can still promote at design time, which the control
says in its help text rather than pretending the label is the last word. `mixed`
means one section is used both ways, which is the cue to define two sections.

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

### 10.1 The verdict (`core/verdict.ts`)

Everything the Design tab *says* about a member is one pure function of that
member's result. The canvas is a renderer; it decides nothing.

This is a contract, not a tidy-up. When the rules lived inline in the canvas
they could not be tested, and two defects lived there undetected: members in
every refusal state (`not-designable`, `not-implemented`, `no-result`) rendered
**no label and the brand navy stroke** — pixel-identical to a passing member —
and *every* steel member drew red, because the colour rule asked `mode ===
"checked"` first and steel carries no mode, so it fell into the binary
required-mode branch at any `D/C > 0`.

**Totality is the invariant.** Every reachable `MemberDesignResult` produces a
non-empty top label. A member that renders nothing reads as "the design did not
run", which is the most expensive lie a design tool can tell. Asserted by
`validation/design_labels_smoke.mts`.

**Two questions, asked separately, because they fail separately:**

| | Question | Verdict | Colour |
|---|---|---|---|
| Strength | Do the capacity equations pass? | `Overstressed (D/C 1.19)` | red |
| Detailing | Can it be built and hinge as assumed? | `Insufficient Detailing` | amber |
| Neither | — | `Satisfied 0.42` | D/C band |
| Refused | — | `Not designed — …` | grey |

A section can satisfy every equation and still be unbuildable, so detailing
never rides on the D/C number, and red never means "detailed wrong" — that would
send the engineer to resize a section that is already the right size. When both
fail, strength takes the headline and detailing is **still listed** in the
causes: fixing the size does not make the bars fit.

**The bottom pill names the failing channels**, and may name several — a member
can fail two at once, and showing only the governing one hides work.

| Material / kind | Strength causes | Detailing groups |
|---|---|---|
| RC beam | Flexural, Shear | Bar Detailing, Stirrup Detailing, Section Limits |
| RC column | Axial-Moment, Shear | Confinement, Bar Detailing, SCWB |
| Steel | Axial-Moment *(H1/H2)*, Flexural *(F, `Pr=0`)*, Axial, Shear | Ductility *(341 D1.1)*, Bracing *(D1.2, advisory)*, SCWB *(E3.4a)* |

The vocabulary is the engineer's, not the code's — "Axial-Moment", not
"H1-1b" — because a red member raises the question *what do I resize*, not
*which equation*. Steel appends its governing equation, where that is genuinely
diagnostic.

**Detailing travels on the result.** `MemberDesignResult.detailing:
DetailingCheck[]` is populated by the strategy. It used to be computed only
inside the RC flyout, so the canvas could not know a beam's bars did not fit.
The flyout still computes its own copy live — the design pass is deferred, and
detailing checks must answer at typing speed.

**SCWB is a detailing verdict**, not a fake infinite D/C. The run-design
post-pass records `scwbPass` on every column of a checked joint (both
materials); it used to force `worstFlexureDC = Infinity`, which made a correctly
sized column report as overstressed.

### 10.2 One material at a time

RC and steel `D/C` answer different questions, so the canvas never draws both.
A **segmented switch** in the **Design Results** card selects the material; it
renders only when the run produced results for both, so there is never a dead
control. Off-material members are drawn in `COLOR_DESIGN_OFF_MATERIAL` with no
label — visible as context, plainly outside the conversation. Hiding them would
make the structure look broken.

### 10.2b One blended RC list, scoped per item

The RC reports are organised by **quantity**, not by element × mode. There is
one `Concrete` group holding one entry per thing an engineer looks for:

| Report | Beam | Column |
|---|---|---|
| `rc-long` — Longitudinal bar | `AsTop` / `AsBottom` per face per zone, mm² | `Ast`, mm² |
| `rc-rho` — Reinforcement ratio | `rhoTop` / `rhoBottom` per face | `ρg` |
| `rc-trans` — Transverse bar | `AvS`, mm²/m (or the suggested bar@spacing) | tie `AvS` |

Each renders on **every** RC member in **both** modes, because the engine
resolves the mode rather than the renderer: `AsTop`, `AsBottom`, `AvS` and `Ast`
all mean *the actual bars* — the area required in `required`, the area provided
in `checked`. A red number means that face or that channel did not pass.

This replaced three menu sections — beam-required, beam-checked, column — which
were four ways of asking three questions. A reader wanting "how much
longitudinal steel is here" had to know the element and the section's mode
before they could pick the right entry, and picking wrong painted an empty
canvas.

**Scope moved from the group to the item.** `DesignReportItem.scope` is what
still keeps the menu honest — choosing a report no member matches leaves the
canvas blank, which reads as a broken tool rather than as an empty set. Only
three entries carry one, and only on `kind`:

| Report | Why it is scoped, not blended |
|---|---|
| `col-confine` — Confinement (tie legs) | no beam analogue |
| `col-slender` — Slenderness | no beam analogue |
| `col-scwb` — Strong-column-weak-beam | joint-level, columns only |

So a beam-only model is offered three reports plus the summary; add a column and
the other three appear, in the same single group. Steel is untouched — it has
neither a beam/column split nor a required/checked mode, so nothing about the
merge applies to it.

**Confinement reports legs, not an Ash area.** The leg count is what a detailer
draws, and it is where *cannot be built* becomes visible: 18.7.5.2 supports every
corner bar and alternate bars with a hoop corner or crosstie, so each leg needs a
longitudinal bar to hold it. Demand more legs than the grid has bars and the
label reads `5 legs > 3 bars — inadequate detail`. That is a **detailing**
failure — add bars or grow the section — so it never touches the D/C, matching
the strength-vs-detailing split in §10.1.

**Slenderness reports a verdict.** `slendernessOk` is false only when
`Pu ≥ 0.75·Pc`, where the 6.6.4.5.2 denominator goes non-positive and δns runs
away — the member buckles before it yields. A short column (the 6.2.5 gate) and
a slender-but-stable one both read satisfied; their amplified moments are
already inside the interaction D/C, so this answers *does it stand up*, not *is
it big enough*.

The DESIGN SCHEDULE is the exception: it is an inventory with a Class column, so
it defaults to **All** and offers the filter as three chips.

### 10.3 Canvas mechanics

- **Member colour** — `memberDisplayColor`; bands from `designColorForDC` in
  `constants.ts`. Required mode stays binary (adequate blue / inadequate red):
  it is a solve, not a check, so there is no ratio to band.
- **Two rotated pill labels** per member at mid-span — the verdict on the
  **+local-2** side, the causes on **−local-2** (the sides the diagrams use).
- Every other report (`req-*`, `chk-*`, `col-*`, `stl-*`) is a numeric overlay
  and keeps its own formatting; only `default` is the verdict.
- A **colour-legend** card appears bottom-right when results exist, with
  detailing and not-designed swatches under the ratio bands.
- Run issues render in an amber card at top-center, **capped at 26vh and
  scrollable** — unbounded, it grew one line per failing channel per member and
  covered the structure it was reporting on, worst exactly when the most
  members failed.

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

1. **Add the strategy folder** `src/2d/lib/design/<material>/` with its own
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
