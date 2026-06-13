# DESIGN_RULES.md — OpenANSTRUK-2D Member Design Engine

This document narrates **what the Design tab actually does** — the engineering
logic, the governing code clauses, and the assumptions behind every number it
produces. It is the authoritative reference for the `src/lib/design/` domain
modules.

> **Scope today (v1.1.1):** Reinforced-concrete (RC) **rectangular** sections, per
> **ACI 318-14** (≡ **SNI 2847:2019**), for Ordinary / Intermediate / Special
> moment frames (OMF / IMF / SMF):
> - **Beams** — flexure + shear.
> - **Columns** — axial-flexure **P–M interaction** capacity ([§5b](#5b-columns--pm-interaction)).
>   Column **shear** and SRPMK `Ash` confinement are a follow-up pass.
>
> **Scope tomorrow:** column shear/confinement, structural **steel** members, and
> additional concrete **section shapes** (T, L, circular, hollow…). The engine is
> deliberately structured so these slot in as new *material/shape strategies*
> behind the same pipeline — see [§12 Extending the engine](#12-extending-the-engine).

All code clause numbers below are **ACI 318-14**. SNI 2847:2019 adopts the same
numbering and equations; where the two diverge the ACI value is used.

---

## 1. Design philosophy

The design engine is a **pure-domain layer** (no React) under `src/lib/design/`.
It consumes the analysis results (the same DSM solver that drives the Analyze
tab) and a small set of user-supplied *design criteria* + *per-section
reinforcement*, and produces, per member, per zone:

- **Flexure**: required steel (design mode) or capacity ratio D/C (check mode).
- **Shear**: required `Aᵥ/s` + a suggested stirrup, or a capacity ratio D/C.
- **Detailing**: a live pass/warn/fail checklist against ACI spacing, cover,
  layering, and seismic rules.

Two principles govern the whole engine:

1. **Demand is exact, capacity is explicit.** Internal forces come from
   closed-form polynomials (no station sampling — [§4](#4-demands)); capacity
   comes from first-principles strain compatibility or the Whitney block, never
   a lookup table.
2. **The drawing and the math share one geometry.** The cross-section preview
   and the flexural solver both read the *same* `buildBarLayout()` — so what you
   see is what is analyzed ([§6](#6-bar-layout--layering)).

---

## 2. Module map & data flow

```
src/lib/design/
├── types.ts        DesignCriteria, SectionDesignInput, RebarArrangement,
│                   result types (ZoneFlexureResult, ZoneShearResult, …)
├── rebar.ts        Metric bar catalogue D10–D32 (db, area)
├── bar-layout.ts   buildBarLayout(): bar positions + layering;
│                   checkArrangement() / checkTransverse(): live ACI detailing
├── flexure.ts      beta1, asMin, requiredAs (Whitney), phiMnProvided /
│                   phiMnBars (strain compatibility), φ ramp
├── shear.ts        vc, vMaxLimit, avMinPerS, avSRequired, spacing caps,
│                   suggestStirrup, avSProvided, phiVnProvided
├── demands.ts      zoneRanges, zoneExtremes (analytic), envelope, frame
│                   moment minimums, buildGravityCombo
└── run-design.ts   runDesign() orchestrator — solves cases itself, then
                    flexure → shear per member per zone
```

**Flow (`runDesign`):**

```
enabled combinations ──► solveAllCases() ──► combineResults() per combo
                                                   │
        buildGravityCombo (1.2D+1.0L) ─────────────┤ (for IMF/SMF Vg)
                                                   ▼
   for each member:
     designable?  ─no─► status "not-designable"
        │yes
     geometry (b, h, fc, effective depths)
        │
     envelopeMemberDemands ──► applyFrameMomentMinimums
        │
     Pu < 0.1 f'c Ag ? ─no─► status "axial-exceeded"
        │yes
     FLEXURE per zone  ─────────────► provides As / capacity
        │
     SHEAR per zone (needs flexural steel for Ve)
        │
     aggregate worst D/C, pass flags  ──► MemberDesignResult
```

`runDesign()` calls `solveAllCases` + `combineResults` **itself** — it does *not*
reuse the Analyze tab's lazy memo, so design works regardless of which tab is
active.

---

## 3. Applicability & qualification

### 3.1 Designable sections (`isSectionDesignable`)
A section is designable when **all** hold:
- `materialClass === "concrete"`
- `shape.kind === "rect"`
- `strength.fc > 0`, `dims.b > 0`, `dims.h > 0`

Anything else (steel, non-rectangular, missing strength) is listed but disabled
("N.A.") in the section picker and renders `status: "not-designable"`.

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

## 4. Demands (`demands.ts`)

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

## 5. Flexure (`flexure.ts`)

All flexure math is internal in **N, mm, MPa**; moments cross the API boundary in
**kN·m**. Constants: `εcu = 0.003` (22.2.2.1), tension-controlled limit
`εt = 0.005` (21.2.2).

### 5.1 Common quantities
- **Stress-block factor** `β₁ = 0.85 − 0.05(f'c − 28)/7`, clamped `[0.65, 0.85]`
  (22.2.2.4.3).
- **Minimum steel** `As,min = max(0.25√f'c, 1.4)/fy · bw·d` (9.6.1.2).
- **φ ramp** (21.2.2): `φ = 0.65 + 0.25·(εt − εty)/(0.005 − εty)`, clamped between
  `phiCompression` (0.65, tied) and `phiTension` (0.9). `εty = fy/Es`. The ramp
  always uses the **actual** `fy`, even when an overstrength `fy` is substituted
  for Mpr.

### 5.2 "As required" mode — Whitney block (`requiredAs`)
Given a design moment `Mu`:
1. `d = h − d′` (the user's *Cover to rebar centroid*, default 50 mm).
2. `cmax = εcu/(εcu + 0.005)·d`, `amax = β₁·cmax`.
3. Solve `a = d − √(d² − 2Mu/(φ·0.85·f'c·b))`.
   - `a ≤ amax` → **singly reinforced**: `As = Mu/(φ·fy·(d − a/2))`.
   - `a > amax` (or discriminant < 0) → **doubly reinforced**: hold the concrete
     block at `amax`, carry the remainder with an `As′/As2` couple;
     `f's = min(fy, Es·εcu·(cmax − d′c)/cmax)`. If `f's − 0.85f'c ≤ 0` the
     compression steel cannot develop net force → `adequate: false`.
4. Floor the result at `As,min`.

This is the **validation-anchored** path (book Contoh 5-A/5-B) and is kept
byte-stable: required mode is *tension-steel-only* for capacity, matching the
reference.

### 5.3 "As checked" mode — per-bar strain compatibility (`phiMnBars`)
Capacity of an explicit bar layout (top + bottom + **side/skin** bars) by strain
compatibility:
1. For a trial neutral-axis depth `c`, each bar strains `εs = εcu·(c − d_i)/c`,
   stress `fs = clamp(Es·εs, ±fy)`.
2. Bars inside the stress block carry the **displaced-concrete correction**
   `(fs − 0.85f'c)` (omitting this is a common ~2–4 % unconservative error).
3. Bisect `c` on axial equilibrium `0.85f'c·b·a + Σ(bar forces) = 0`.
4. `Mn = Σ moments about the compression fibre`; `εt` taken at the **extreme**
   tension bar (21.2.2) for the φ ramp.

**Side (skin) bars are included** in capacity here — 9.7.2.3 permits counting
skin reinforcement *exactly when a strain-compatibility analysis is performed*,
which this is. (In the older Whitney path they would be excluded.)

`D/C = Mu / φMn` per bending sign; `dc = max(dcPos, dcNeg)`.

### 5.4 Mpr / Mn for capacity-design shear
- **Mn** (IMF): `phiMnBars` with the actual `fy`, take `.Mn` (φ = 1).
- **Mpr** (SMF): same solver with `fy → 1.25·fy` (probable strength, 18.6.5.1),
  take `.Mn`.

In checked mode these run through the **same** strain-compat solver (side bars
included). In required mode they use the Whitney `phiMnProvided` on the required
tension steel (AsPrime = 0), preserving the validation anchor.

---

## 5b. Columns — P–M interaction (`column.ts`, `column-layout.ts`)

Columns are designed by a **P–M interaction** capacity surface, the same
strain-compatibility mechanic as [§5.3](#53-as-checked-mode--per-bar-strain-compatibility-phimnbars)
generalised so the net axial is no longer forced to zero. `column.ts` reuses
`beta1`, `εcu`, `εt` from `flexure.ts`; flexure.ts itself is untouched
(byte-stable anchors). Sign convention matches the solver: **tension +,
compression −**. Validated against book Contoh 5-C (`validation/rc_column_verify.mts`).

### 5b.1 Section forces at neutral-axis depth `c` (`sectionForcesAtC`)
About the **geometric centroid** (h/2), with `a = min(β₁c, h)`:
```
Cc  = 0.85·f'c·b·a                       (at a/2 from the compression face)
Fsᵢ = Asᵢ·(fsᵢ − displaced),  fsᵢ = clamp(Es·εcu·(c−dᵢ)/c, ±fy)
      displaced = 0.85f'c when fsᵢ > 0 ∧ dᵢ ≤ a
Pn  = Cc + ΣFsᵢ      (compression +, then negated at the boundary → tension +)
Mn  = Cc·(h/2 − a/2) + ΣFsᵢ·(h/2 − dᵢ)
```
`εt` at the extreme tension bar drives the same **φ ramp** 0.65→0.9 (21.2.2).

### 5b.2 Continuous sweep → closed curve (`buildInteractionCurve`)
Sweeping `c` from `0⁺` (all bars yield in tension → **E**, pure tension) up
through pure moment (Pn = 0 → **D**), tension-control (εt = 0.005 → **C**),
balanced (εt = εy → **B**), to large `c` (pure compression → **A**) traces the
whole **+M** edge. Re-sweeping with mirrored depths `dᵢ → h − dᵢ` gives the
**−M** edge; the two share endpoints A and E → a **closed loop** (asymmetric when
nx ≠ ny). Closed-form endpoints:

| Point | Quantity | Clause |
|-------|----------|--------|
| **A** pure compression | `Po = 0.85f'c(Ag − Ast) + fy·Ast`; **cap `Pn,max = 0.80·Po`** (tied) | 22.4.2.2 / 22.4.2.1 |
| **E** pure tension | `Pnt = fy·Ast` | 22.4.3.1 |

Every compression-side `φPn` is clamped to `−φPn,max`, so the polygon top is a
flat cap edge (vertical/near-axial rays intersect it cleanly).

### 5b.3 Radial D/C (`interactionDC`)
The origin lies inside the surface, so the ray O→(Mu, Pu) crosses the closed
φ-polygon exactly once; **D/C = ‖demand‖ / ‖crossing‖**. Demand pairs come from
`collectPMPairs` (the actual (P, M) acting together at each candidate station —
*not* independently enveloped); the worst across combos × stations governs.

### 5b.4 Bar layout + modes (`column-layout.ts`)
- **As-checked**: `nx × ny` perimeter grid (total `2nx + 2ny − 4`; bar inset =
  `cover + tie + ½db`). Live checks: ρg ∈ [1%, 8%] (10.6.1.1), ≥ 4 bars
  (25.7.2.1), 25.2.3 clear spacing, cover.
- **As-required**: bisect ρg ∈ [1%, 8%] (D/C decreases monotonically with ρg) on
  a representative symmetric ring; report required ρg + Aₛₜ.

> **Deferred (next pass):** column **shear** (`Ve` from `Mpr`, `Vc = 0` seismic) +
> the **SRPMK `Ash` confinement** table (Contoh 5-D), spiral columns
> (`Pn,max = 0.85`), and slenderness (6.6/6.7).

---

## 6. Bar layout & layering (`bar-layout.ts`)

`buildBarLayout(b, h, cover, arrangement)` is the **single source of truth** for
every bar's `(x, depth, db, area, role, layer)`. Both the SVG preview and
`phiMnBars` consume it.

### 6.1 Single-layer fit (25.2.1)
Minimum clear spacing in a layer `s_min = max(25 mm, db, (4/3)·d_agg)`, with the
nominal maximum aggregate size assumed `d_agg = 25.4 mm` (`AGG_SIZE_MM`, ⇒
(4/3)·d_agg ≈ 33.9 mm) — not a tracked input. Bars that fit in one layer:

```
nMax = floor((bwClear + s_min)/(db + s_min)),   bwClear = b − 2·cover − 2·db,stirrup
```

### 6.2 Auto-overflow to a second layer
When `count > nMax`, the overflow goes to a **second layer**:
- **Clear gap between layers = 50 mm, hard-coded** — above the 25 mm code
  minimum (25.2.2), chosen for 135° seismic-hook tail clearance and vibrator
  access. The check messaging cites 25.2.1 (why they overflowed), not 25.2.2.
- Layer-2 bars are **vertically aligned** above layer-1 bars (25.2.2).
- **A lone overflow bar is impractical**: when the overflow is exactly one bar
  (and the layer holds ≥ 3), one more bar is pulled down so the second layer
  carries **two bars at the outer left/right positions**.
- **Maximum 2 layers.** Beyond `2·nMax` the arrangement does not fit → flexural
  `dc = ∞`, flagged unbuildable.

### 6.3 Effective depths
- **Flexure** integrates each bar at its own depth — there is no lumped `d`.
- **Shear** uses `d` = depth to the **centroid** of the tension group (22.5).
- The φ ramp uses the **extreme** (outermost) tension bar depth (21.2.2).

### 6.4 Side (skin) bar distribution
Side bars are distributed **evenly between the innermost top and bottom rows**:
`n` side bars split the clear height into `n + 1` equal gaps (interior division
points only). Per face, mirrored left/right.

### 6.5 Input clamping
The SECTION DESIGN tool clamps each bar-count input to its geometric maximum so a
user cannot enter an unbuildable arrangement:
- top/bottom → `maxBarsTwoLayers()` (the 2-layer cap),
- side → `maxSideBars()` (vertical clear-spacing limit between top/bottom rows).

---

## 7. Shear (`shear.ts`, `run-design.ts`)

Flexure runs **before** shear because the capacity-design shear needs the
flexural steel.

### 7.1 Capacities
- **Concrete** `Vc = 0.17·λ·√f'c·bw·d` (22.5.5.1). *(The book's worked example
  used 1/6 ≈ 0.167 — a ~2 % difference; we use the code coefficient 0.17.)*
- **Cross-section ceiling** `φVmax = φ·(Vc + 0.66·√f'c·bw·d)` (22.5.1.2). Demand
  above this → section too small (`crossSectionOk = false`).
- **Minimum web steel** `Aᵥ,min/s = max(0.062√f'c, 0.35)·bw/fyt` (9.6.3.3),
  required where `Vu > ½·φVc` (9.6.3.1).

### 7.2 Design shear `Vdesign = max(Vu, Ve)`
| Frame | `Ve` (capacity-design shear) | `Vc` in end zones |
|-------|------|------|
| **OMF** | — (envelope `Vu` only) | full |
| **IMF** | `(Mn_i + Mn_j)/L + Vg` (nominal end moments) | full |
| **SMF** | `(Mpr_i + Mpr_j)/L + Vg` (probable moments, 1.25fy) | **0** (18.6.5.2) |

Both sway directions are evaluated (`(M⁻_i + M⁺_j)/L` and `(M⁺_i + M⁻_j)/L`); the
larger governs. `Vg` is the gravity shear from the internal 1.2D+1.0L combo.

### 7.3 Required `Aᵥ/s` and stirrup suggestion
- `Aᵥ/s = max((Vdesign − φVc)/(φ·fyt·d), Aᵥ,min/s)` (R22.5.10.5), in mm²/m.
- `suggestStirrup` picks a spacing (25 mm steps, ≥ 25 mm) for the chosen bar/leg
  count, capped by the governing spacing maximum ([§7.4](#74-spacing-maxima)).

### 7.4 Spacing maxima (`governingSpacingMax`)
| Context | Maximum spacing | Clause |
|---------|------|--------|
| SMF hinge (end zone) | `min(d/4, 6·db,long, 150)` | 18.6.4.4 |
| IMF hinge (end zone) | `min(d/4, 8·db,long, 24·db,hoop, 300)` | 18.4.2.5 |
| General — low Vs | `min(d/2, 600)` | 9.7.6.2.2 |
| General — **high Vs** | `min(d/4, 300)` | 9.7.6.2.2 |

"High Vs" means the required steel shear `Vs = Vu/φ − Vc` exceeds
`0.33·√f'c·bw·d` (`vsSpacingThreshold`). This tightening is demand-dependent, so
it is enforced at **Run**; the live preview shows the baseline `min(d/2, 600)`
with a note.

---

## 8. Detailing checks (live, demand-independent)

Rendered under the cross-section preview in **As-checked** mode, updating as you
type (no solver run needed). All are geometry-only.

### 8.1 Longitudinal (`checkArrangement`)
| Check | Rule | Clause |
|-------|------|--------|
| Single-layer fit / 2-layer overflow | bars fit within 2 layers | 25.2.1 |
| Clear spacing in a layer | `≥ max(25, db, (4/3)·d_agg)`, `d_agg = 25.4 mm` | 25.2.1 |
| Max bar spacing (crack control) | `≤ min(380·(280/fs) − 2.5cc, 300·(280/fs))`, `fs = ⅔fy` | 24.3.2 |
| Minimum cover | `≥ 40 mm` (cast-in-place, not exposed — assumed) | 20.6.1.3.1 |
| SMF continuous bars | `≥ 2` top and bottom | 18.6.3.1 |
| Skin reinforcement | required (and checked for spacing) when `h > 900 mm` | 9.7.2.3 |

### 8.2 Transverse (`checkTransverse`)
| Check | Rule | Clause |
|-------|------|--------|
| Max stirrup/hoop spacing | per frame + zone ([§7.4](#74-spacing-maxima)); midspan SMF/IMF → `d/2` | 9.7.6.2.2 / 18.4.2.5/6 / 18.6.4.4/6 |
| Minimum web steel | `Aᵥ/s ≥ Aᵥ,min/s` | 9.6.3.3 |
| SMF lateral support | `hₓ ≤ 350 mm` (laterally-supported bar spacing) | 18.6.4.2 |
| Minimum hoop bar | `≥ D10` (practice) | 25.7.1 |
| First-hoop placement | `≤ 50 mm` from the support face (advisory — span placement not modelled) | 18.6.4.1 / 18.4.2.4 |

> ACI sets **no minimum** stirrup spacing — only maxima. A constructability
> advisory may be shown for very tight spacing, clearly marked as practice.

---

## 9. Frame-type matrix (OMF / IMF / SMF)

| Aspect | OMF | IMF | SMF |
|--------|-----|-----|-----|
| Moment minimums | none | ⅓ / ⅕ (18.4.2.2) | ½ / ¼ (18.6.3.2) |
| Shear demand | envelope `Vu` | `Ve` from **Mn** + Vg | `Ve` from **Mpr** (1.25fy) + Vg |
| `Vc` in end zones | full | full | **0** (18.6.5.2) |
| Hinge hoop spacing | n/a | `min(d/4, 8db, 24db_h, 300)` | `min(d/4, 6db, 150)` |
| Lateral support hₓ | n/a | n/a | `≤ 350` (18.6.4.2) |

> **Validation status:** the numeric anchor (`validation/rc_beam_verify.mjs`) is an
> **SMF** worked example. OMF/IMF follow the same code text and share the engine,
> but are not separately anchored to a published example yet.

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

## 11. Validation

| Script | Anchors |
|--------|---------|
| `validation/rc_beam_verify.mjs` | Book Contoh 5-A/5-B (SMF, 350×600, f'c 30, fy 420): `As = 2224 mm²`, `Mpr = 552.9 kN·m`, `Ve = 234.03 kN`, `Aᵥ/s = 1417 mm²/m → D10@100`; β₁ clamps, As,min, φ-ramp endpoints, analytic zone extremes vs dense sampling (25 assertions). |
| `validation/strain_compat_check.mts` | Strain-compat ≡ Whitney on the single-layer case; Mpr parity; compression steel; 2-layer bracketing; side-bar capacity gain; auto-overflow geometry (50 mm clear, centroid, corner placement); transverse spacing caps + Vs threshold (16 assertions). Run via `npx tsx --tsconfig config/tsconfig.json …`. |
| `validation/rc_column_verify.mts` | Book Contoh 5-C (600×600, f'c 30, fy 420, 20D25): `Po = 13050 kN`, `φPn,max = 6786 kN`, balanced/tension-control/pure-moment/pure-tension coordinates (B −2594/856, C −1394/1068, D 0/855, E +3710), demand (−1435, 625) inside the φ curve, polygon cap edge, and column engine ≡ `phiMnBars` at pure bending (26 assertions). Run via tsx. |

Required-mode flexure and the SMF shear path are **byte-stable** against these
anchors — changes to the strain-compat / checked path must keep them passing.

---

## 12. Extending the engine

The pipeline (`runDesign` → demands → flexure → shear → detailing) is
material-agnostic in its *shape*. Adding new capability means adding strategies,
not rewriting the orchestrator.

### 12.1 New concrete section shapes (T, L, hollow, circular)
1. The section must already exist as a parametric shape (`lib/sections/`).
2. Broaden `isSectionDesignable` to admit the new `shape.kind`.
3. Generalise the geometry resolver in `run-design.ts` and the flexural
   compression-zone model: the Whitney block and `phiMnBars` currently assume a
   **rectangular** compression area `0.85f'c·b·a`. A flanged/circular section
   needs a shape-aware `compressionResultant(c)` (area + centroid of concrete
   above the neutral axis). Factor this into a per-shape strategy and keep
   `phiMnBars` consuming `{ Cc(c), yc(c) }` instead of `b` directly.
4. Bar layout (`buildBarLayout`) is already position-based; extend it to place
   bars on the actual section outline.

### 12.2 Columns (axial + in-plane flexure) — implemented (capacity)
The P–M interaction capacity path is implemented in **v1.1.1** ([§5b](#5b-columns--pm-interaction)):
`column.ts` (`sectionForcesAtC` / `buildInteractionCurve` / `interactionDC`),
`column-layout.ts` (perimeter grid + ρg checks), the Element-Type resolver in
`run-design.ts`, and the section + P–M Advanced Report. **Still open:**
- **Column shear** — `Ve` from column-end `Mpr`, `Vc = 0` seismic; and the
  **SRPMK `Ash` confinement** table (Tabel 5-20, Pers. a/b/c with `Ach`, `bc`,
  `kf`, `kn`, cross-tie spacing) — Contoh 5-D.
- **Spiral** columns (`Pn,max = 0.85`), **slenderness** (6.6/6.7), and biaxial
  out-of-plane (the 2D model has one bending axis).

### 12.3 Steel members
Steel is a distinct material strategy, not a tweak to the RC path:
- New `src/lib/design/steel/` sibling with its own `types`, capacity, and
  detailing (e.g. **AISC 360** or the steel provisions of the chosen code):
  flexure `Mn` (yielding / LTB / FLB), shear `Vn`, axial `Pn`
  (yield/buckling), and **combined** `P-M` interaction (H1).
- `isSectionDesignable` gains a steel branch (`materialClass === "steel"` + a
  supported shape). The SECTION DESIGN "Material Class" select already reserves a
  steel option.
- `runDesign` dispatches on `materialClass` to the RC or steel evaluator; the
  zone/demand/envelope machinery in `demands.ts` is reused unchanged.
- Results: reuse `MemberDesignResult` (D/C per limit state) and the canvas
  colouring; add steel-specific labels.

### 12.4 New design codes
`DesignCode` is a single-entry union today. Multiple codes means parameterising
the clause **constants** (φ factors, `β₁` law, `As,min`, `Vc` coefficient,
spacing limits) behind a `codeProfile` object selected by `DesignCriteria.code`,
rather than branching inline. The clause *structure* is shared across ACI/SNI;
Eurocode 2 / others would add a profile + a few formula overrides.

> **Guiding rule for contributors:** keep `run-design.ts` as a thin orchestrator.
> Material- and shape-specific physics belong in strategy modules
> (`flexure.ts` / `shear.ts` / future `steel/…`), and *every* engineering formula
> must cite its clause in a comment and, where it anchors a known example, gain a
> `validation/` assertion.

---

## 13. Known v1.1.1 limitations

- **Beams (flexure + shear) + columns (P–M capacity)** — column **shear** and
  SRPMK `Ash` confinement deferred; **spiral** columns, **slenderness**, and
  biaxial out-of-plane deferred ([§12.2](#122-columns-axial--in-plane-flexure--implemented-capacity)).
- **RC rectangular only** — other shapes and steel deferred (engine ready, see
  [§12](#12-extending-the-engine)).
- **OMF/IMF unanchored** — share the SMF-validated engine but lack a separate
  published-example check. Column anchor is SMF Contoh 5-C (capacity).
- **Column D/C = radial-to-origin** against the closed φ-polygon; demand pairs
  sampled at candidate stations (zone bounds + V=0 / qx=0 roots + quarter points).
- **`Ln` = node-to-node length** — no column-face offset for the clear span.
- **Top/bottom = ±local-2** (beams), not gravity-up, for vertical/inclined
  members. Column "auto" classification uses orientation (`|Δy| > |Δx|`) + the
  `Pu ≥ 0.1 f'c Ag` promotion.
- **Design state is App-state only** — `designCriteria`, `sectionDesignInputs`,
  `designResult` are *not* part of `StructureModel` and are *not* saved by
  JSON Save/Load (same boundary as load cases/combinations).
- **Aggregate size assumed `d_agg = 25.4 mm`** in the 25.2.1 clear-spacing check;
  exposure class assumed sheltered cast-in-place (40 mm cover) in 24.3.2 /
  20.6.1.3.1. Neither is a tracked input.

---

*Cross-references:* solver sign conventions and the analysis pipeline are in
[`CLAUDE.md`](../CLAUDE.md) and [`docs/ARCHITECTURE.md`](ARCHITECTURE.md); the
user-facing walkthrough is in [`docs/USER_GUIDE.md`](USER_GUIDE.md).
