# DESIGN_RC.md — Reinforced-Concrete Design (ACI 318 / SNI 2847)

The reinforced-concrete half of the Design tab: flexure, columns, shear,
detailing, and the per-code rule tables. The material-agnostic machinery that
feeds it — designability, element-type resolution, demands, the run
orchestrator — is in [`DESIGN_RULES.md`](DESIGN_RULES.md). Steel is in
[`DESIGN_STEEL.md`](DESIGN_STEEL.md).

> **Section numbers are shared across the three design documents**, so a
> reference like "§5b.5" resolves to exactly one place no matter which file it
> was written in. `DESIGN_RULES.md` holds §1–§4, §10, §12 and §13; this file
> holds §5–§9, §11 and §12.1–§12.2; `DESIGN_STEEL.md` holds §S1–§S14. Numbering
> was preserved through the split so existing citations keep working.

**Scope.** RC **rectangular** sections plus **circular columns**, per a
selectable code (`RcCriteria.code` → `SNI2847-19` | `ACI318-25`).
**SNI 2847:2019 is the project's main/default code**; it was adopted from
**ACI 318-14**, so the two are one baseline. ACI 318-25 is the selectable
alternative and **diverges in exactly three rows** (the εty+0.003 tension limit
of Table 21.2.2, the cₘₐₓ it drives, and the λs size-effect Vc of 22.5.5.1.3) —
see [§5c](#5c-code-edition-deltas) for the diff and [§9](#9-rectangular-rc-beam--per-code-rule-tables-the-canonical-reference)
for the full per-code tables. Frame types are **SRPMB / SRPMM / SRPMK** under
SNI 2847:2019 and **OMF / IMF / SMF** under ACI 318-25; they map 1:1 ([§9](#9-rectangular-rc-beam--per-code-rule-tables-the-canonical-reference)).

- **Beams** — flexure + shear.
- **Columns** — rectangular and circular: axial-flexure **P–M interaction**
  capacity, **capacity-design shear** (Ve from Mn/Mpr, Vc = 0 in the SMF hinge
  zone), **transverse confinement** (SRPMK `Ash` / SRPMM ties / SRPMB ties;
  circular **spiral** ρs or circular ties), **strong-column-weak-beam**
  (18.7.3.2), **non-sway slenderness** (δns, in-plane), and **spiral** columns
  ([§5b](#5b-columns--pm-interaction-rccodescodecolumnts-rcsharedcolumn-gridts),
  [§12.1b](#121b-circular-columns-v113)).

All code clause numbers below are **ACI 318** Chapter-18/22 numbering (shared by
SNI 2847:2019, which was adopted from ACI 318-14). Frame-type detailing
(Chapter 18) is edition-stable and identical in both `codes/<code>/` folders.

**Two principles govern this engine.** Demand is exact and capacity is explicit:
internal forces come from closed-form polynomials rather than station sampling
([§4](DESIGN_RULES.md#4-demands)), and capacity comes from first-principles
strain compatibility or the Whitney block, never a lookup table. And the drawing
and the math share one geometry — the cross-section preview and the flexural
solver both read the *same* `buildBarLayout()`, so what you see is what is
analysed ([§6](#6-bar-layout--layering-geometry-rcsharedbar-geometryts-detailing-checks-rccodescodebeamts)).

---

## 5. Flexure (`rc/codes/<code>/beam.ts`)

All flexure math is internal in **N, mm, MPa**; moments cross the API boundary in
**kN·m**. Constants: `εcu = 0.003` (22.2.2.1); tension-controlled limit `εt` is
**code-dependent** — `0.005` for SNI 2847:2019 (the main code) and `εty + 0.003`
for ACI 318-25 (`epsTC`, [§5c](#5c-code-edition-deltas)). The `0.005` shown in the
formulas below is the SNI baseline.

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

## 5b. Columns — P–M interaction (`rc/codes/<code>/column.ts`, `rc/shared/column-grid.ts`)

Columns are designed by a **P–M interaction** capacity surface, the same
strain-compatibility mechanic as [§5.3](#53-as-checked-mode--per-bar-strain-compatibility-phimnbars)
generalised so the net axial is no longer forced to zero. `column.ts` reuses
`beta1`, `εcu`, `εt` from the same code's `rules.ts`; the rect beam path is untouched
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

### 5b.4 Bar layout + modes (`rc/shared/column-grid.ts`)
- **As-checked**: `nx × ny` perimeter grid (total `2nx + 2ny − 4`; bar inset =
  `cover + tie + ½db`). Live checks: ρg ∈ [1%, 8%] (10.6.1.1), ≥ 4 bars
  (25.7.2.1), 25.2.3 clear spacing, cover.
- **As-required**: bisect ρg ∈ [1%, 8%] (D/C decreases monotonically with ρg) on
  a representative symmetric ring; report required ρg + Aₛₜ.

### 5b.5 Capacity-design shear, confinement, SCWB, slenderness, spiral

All in `rc/codes/<code>/column.ts` (math) + `rc/strategy.ts` (`designColumnShear`,
slenderness in `designColumn`) + `core/run-design.ts` (the SCWB joint post-pass):

- **Shear** — `columnFlexuralStrengthAtP(bars, …, Pu, fyFactor)` bisects `c` so
  `Pn(c) = Pu`, returning the flexural strength at the acting axial; `Ve = 2·M/lu`
  with `M` = Mn (IMF/SRPMM, 18.4.3.1) or Mpr (SMF/SRPMK, 1.25fy, 18.7.6.1). OMF
  designs for the factored `Vu`. `columnShearVc` uses the axial-benefit form
  `0.17(1+Nu/14Ag)λ√f'c·bw·d` (22.5.6.1); SMF zeroes Vc in the hinge zone when
  `Pu < Ag·f'c/20` (18.7.6.2.1). Reuses the beam `vMaxLimit`/`avSRequired`/
  `phiVnProvided`/`suggestStirrup` helpers; hoop spacing via `smfEndZoneSpacingMax`
  / `imfEndZoneSpacingMax` / `generalSpacingMax`.
- **Confinement** (`columnConfinement`) — SRPMB tie spacing (25.7.2.3); SRPMM hoop
  spacing over lo (18.4.3.2); SRPMK lo (18.7.5.1), hx ≤ 350 (18.7.5.2), so
  (18.7.5.3), and rectilinear `Ash/(s·bc)` (18.7.5.4). **Code delta:** ACI 318-25
  adds the third Ash equation `0.2·kf·kn·Pu/(fyt·Ach)` (kf = f'c/175+0.6 ≥ 1, kn =
  nl/(nl−2)); SNI keeps the two-equation table. Spiral → the `ρs` requirement
  (25.7.3.3 / 18.7.5.4).
- **Strong-column-weak-beam** (`checkStrongColumnWeakBeam`, SMF only) — a joint
  post-pass: at each joint with both columns and beams, ΣMnc ≥ 1.2·ΣMnb (18.7.3.2,
  the 6/5 rule), reading the per-member nominal `Mn`. Failing columns get
  `scwbPass = false`; `DesignRunResult.joints` carries the verdicts.
- **Slenderness** (`slendernessMagnifier`) — braced, in-plane, k = 1.0 non-sway
  δns (6.6.4), gated by `k·lu/r ≤ 34 − 12(M1/M2) ≤ 40` (6.2.5). EI = 0.4·Ec·Ig,
  Pc = π²EI/(k·lu)², Cm = max(0.4, 0.6 − 0.4·M1/M2). Applied per combo to the
  station moments before the interaction check.
- **Spiral** — `Pn,max = 0.85·Po`, φc = 0.75 (vs tied 0.80 / 0.65); selected by
  `ColumnArrangement.confinement`.

> **Deferred:** sway (δs) / computed-k slenderness, biaxial out-of-plane bending
> (a permanent 2D scope boundary), and column lap-splice/development detailing.

---

## 5c. Code-edition deltas

`SNI 2847:2019` is the **main code**; it was adopted from **ACI 318-14**, so the
`sni2847-19/` module is the 318-14 baseline. The `aci318-25/` module diverges in
**two independent places** (the tension-controlled limit and the no-stirrup `Vc`)
— these surface as the **three ⚑ rows** in the [§9](#9-rectangular-rc-beam--per-code-rule-tables-the-canonical-reference) per-code tables (the cₘₐₓ row is a
derived consequence of the limit). All other clause math — As,min, β1, crack
spacing, the φ values, frame-type detailing — is shared and identical. The deltas
live as `rules.ts` helpers so `beam.ts` / `column.ts` of each code call their own:

| Quantity | `sni2847-19` (ACI 318-14) | `aci318-25` | Clause |
|---|---|---|---|
| Tension-controlled strain limit (`cMax`, φ ramp top) | **0.005** fixed (`EPS_T_MIN`) | **εty + 0.003** = fy/Es + 0.003 (`epsTC(cr)`) | Table 21.2.2 |
| One-way-shear `Vc`, regions **with** ≥ Av,min | `0.17λ√f'c·bw·d` (formula a) | same | 22.5.5.1 |
| One-way-shear `Vc`, regions **without** Av,min | `0.17λ√f'c·bw·d` (no size effect) | **formula (c)** `0.66·λs·λ·ρw^(1/3)·√f'c·bw·d`, **λs = √(2/(1+d/250)) ≤ 1** (`lambdaS(d)`) | 22.5.5.1.3 |
| `√f'c` cap (both modules) | `√f'c ≤ 8.3 MPa` (`sqrtFc`) | same | 22.5.3.1 |

**Where the size-effect inputs come from.** `vc(λ, fc, bw, d, hasMinShearReinf,
ρw)` gains two args; SNI ignores both. `strategy.ts::designZoneShear` resolves
them per zone — `hasMinShearReinf` from checked mode (`avS_provided ≥ Av,min/s`)
or required mode (`Vu > ½φVc`, using the un-penalised Vc); `ρw` from the zone's
longitudinal tension steel (checked = provided, required = required-flexure As).
For beams the formula-(c) penalty therefore only ever affects low-shear regions
that don't govern; it matters most for deep, lightly-reinforced members. SMF hinge
zones zero `Vc` regardless (18.6.5.2), so λs is moot there.

**Practical magnitude.** For Grade-420 stirruped beams the two codes are nearly
identical (εty+0.003 ≈ 0.0051 ≈ 0.005); the divergence grows with steel grade and
member depth. The book validation anchors (Contoh 5-A/B/C) bind to the SNI module
(`rc_beam_verify.mjs`, `rc_column_verify.mts`); the deltas have their own anchors
in `rc_beam_aci31825.mts`.

---

## 6. Bar layout & layering (geometry `rc/shared/bar-geometry.ts`; detailing checks `rc/codes/<code>/beam.ts`)

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

## 7. Shear (`rc/codes/<code>/beam.ts`, `rc/strategy.ts`)

Flexure runs **before** shear because the capacity-design shear needs the
flexural steel.

### 7.1 Capacities
- **Concrete** `Vc` per Table 22.5.5.1. Regions **with** ≥ Av,min use formula (a)
  `Vc = 0.17·λ·√f'c·bw·d` (both codes). Regions **without** min stirrups use
  formula (c) — for ACI 318-25, `Vc = 0.66·λs·λ·ρw^(1/3)·√f'c·bw·d` with the
  size-effect `λs` ([§5c](#5c-code-edition-deltas)); SNI/318-14 keeps the (a) form.
  ρw = the longitudinal tension steel ratio for the zone. The axial term Nu/(6Ag)
  is omitted (beams are axial-gated). *(The book's worked example used 1/6 ≈ 0.167
  — a ~2 % difference vs the code coefficient 0.17.)*
- **Cross-section ceiling** `φVmax = φ·(Vc + 0.66·√f'c·bw·d)` (22.5.1.2). Demand
  above this → section too small (`crossSectionOk = false`).
- **Minimum web steel** `Aᵥ,min/s = max(0.062√f'c, 0.35)·bw/fyt` (9.6.3.3),
  required where `Vu > ½·φVc` (9.6.3.1).

### 7.2 Design shear `Vdesign = max(Vu, Ve)`
The per-frame `Ve` rule and the `Vc = 0` hinge treatment are tabulated in
[§9](#9-rectangular-rc-beam--per-code-rule-tables-the-canonical-reference) (table D). Implementation notes:
- **`Ve`** (`capacityEndMoments` → end moments at `fy` for IMF/SRPMM, `1.25fy` for
  SMF/SRPMK; φ = 1). Both sway directions are evaluated
  (`(M⁻_i + M⁺_j)/Lₙ` and `(M⁺_i + M⁻_j)/Lₙ`); the larger governs.
- **`Vg`** is the gravity shear from the internal `1.2D + 1.0L` combo
  (`buildGravityCombo`).

### 7.3 Required `Aᵥ/s` and stirrup suggestion
- `Aᵥ/s = max((Vdesign − φVc)/(φ·fyt·d), Aᵥ,min/s)` (R22.5.10.5), in mm²/m.
- `suggestStirrup` picks a spacing (25 mm steps, ≥ 25 mm) for the chosen bar/leg
  count, capped by the governing spacing maximum (`governingSpacingMax`, [§7.4](#74-spacing-maxima)).

### 7.4 Spacing maxima
The per-frame caps are in [§9](#9-rectangular-rc-beam--per-code-rule-tables-the-canonical-reference) (table D). One cap is **demand-dependent**: the
general (SRPMB/OMF) case `min(d/2, 600)` tightens to `min(d/4, 300)` when the
required steel shear `Vs = Vu/φ − Vc` exceeds `0.33·√f'c·bw·d`
(`vsSpacingThreshold`). Because it depends on `Vs`, this tightening is enforced at
**Run**; the live preview shows the baseline `min(d/2, 600)` with a note. The
`db_long` in the 6db/8db hinge caps is the **smallest** primary flexural bar
(18.6.4.4(b) / 18.4.2.5(b)).

---

## 8. Detailing checks (live, demand-independent)

The detailing **rules and clauses** are tabulated in [§9](#9-rectangular-rc-beam--per-code-rule-tables-the-canonical-reference). This section
documents only *how* they surface and the implementation-specific assumptions not
captured by a single clause number. All checks are geometry-only and render under
the cross-section preview in **As-checked** mode, updating as you type (no solver
run needed):

- **`checkArrangement`** (longitudinal) renders the §9.A rules: clear spacing
  (25.2.1), crack-control c/c spacing (24.3.2), cover (20.6.1.3.1), SMF/SRPMK
  ρ≤0.025 + ≥2 continuous bars (18.6.3.1), skin reinforcement when h>900 (9.7.2.3).
- **`checkTransverse`** (transverse) renders the §9.D rules: max hoop spacing per
  frame+zone, min web steel `Aᵥ/s ≥ Aᵥ,min/s` (9.6.3.3), SMF/SRPMK lateral support
  `hₓ ≤ 350` (18.6.4.2), min hoop ≥ D10 (25.7.1), and the 2h confined-region pass
  entry; first-hoop ≤ 50 mm is an **advisory** (span placement isn't modeled).
- **`checkBeamDimensions`** renders the §9.B SMF/SRPMK limits (Lₙ ≥ 4d,
  bw ≥ min(0.3h, 250)) from the shortest member span using the section.

**Implementation-only assumptions** (not a single clause):
- 25.2.1 clear spacing uses an assumed aggregate size `d_agg = 25.4 mm`
  (`AGG_SIZE_MM`) — not a tracked input.
- 2-layer auto-overflow uses a hard-coded **50 mm** clear gap (≥ the 25.2.2
  minimum; for 135° hook clearance) — see [§6.2](#62-auto-overflow-to-a-second-layer).
- ACI sets **no minimum** stirrup spacing — only maxima; any tight-spacing advisory
  is clearly marked as practice, not code.

---

## 9. Rectangular RC beam — per-code rule tables (the canonical reference)

These two tables are the **single source of truth** for the beam design rules.
Everything else in this document (§5 flexure, §7 shear, §8 detailing) describes
*how* the engine computes them; the *values* live here.

**SNI 2847:2019 is the project's main code** (it is the default `RcCriteria.code`).
SNI 2847:2019 was adopted from **ACI 318-14**, so the two are treated as one
baseline; ACI 318-25 is the selectable alternative. The two tables differ in
**exactly three rows**, flagged **⚑** (the code-edition deltas, [§5c](#5c-code-edition-deltas)) —
everything else is identical (ACI Chapter 18 is unchanged 318-14 → 318-25).

**Terminology.** SNI 2847:2019 uses the Indonesian frame designations
**SRPMB / SRPMM / SRPMK**; ACI 318-25 uses **OMF / IMF / SMF**. They map 1:1:

| SNI 2847:2019 | ACI 318-25 | Meaning |
|---|---|---|
| **SRPMB** (Sistem Rangka Pemikul Momen Biasa) | **OMF** | Ordinary moment frame |
| **SRPMM** (… Menengah) | **IMF** | Intermediate moment frame |
| **SRPMK** (… Khusus) | **SMF** | Special moment frame |

**Legend:** ⚑ = code-dependent row (the only differences between the two tables) ·
"—" = no requirement · "same" = identical across the three frame types. Clause
numbers are shared by both editions (ACI Chapter 9/18/20/22/24/25). The engine
`frameType` enum is internally `OMF|IMF|SMF` for both codes; the SRPM labels are a
display alias when SNI is selected.

### 9.1 SNI 2847:2019 (≡ ACI 318-14) — main code

**A · Materials, flexure capacity & longitudinal limits**

| Rule | SRPMB | SRPMM | SRPMK | Clause |
|---|---|---|---|---|
| Concrete crushing strain εcu | 0.003 | 0.003 | 0.003 | 22.2.2.1 |
| ⚑ Tension-controlled limit εₜ | **0.005** | **0.005** | **0.005** | 21.2.2 |
| Stress-block β₁ | 0.85−0.05(f'c−28)/7 ∈ [0.65, 0.85] | same | same | 22.2.2.4.3 |
| φ (flexure / shear / comp) | 0.90 / 0.75 / 0.65 | same | same | 21.2.1 |
| As,min | max(0.25√f'c, 1.4)/fy · bw·d | same | same | 9.6.1.2 |
| ⚑ Singly cₘₐₓ (derived) | εcu/(εcu+0.005)·d = **0.375d** | same | same | 21.2.2 |
| Max flexural ρ | — | — | ≤ 0.025 | 18.6.3.1 |
| Min continuous bars | — | — | ≥ 2 top & bottom | 18.6.3.1 |
| M⁺ at joint face | — | ≥ ⅓\|M⁻\| | ≥ ½\|M⁻\| | 18.4.2.2 / 18.6.3.2 |
| Min moment strength anywhere | — | ≥ ⅕ max | ≥ ¼ max | 18.4.2.2 / 18.6.3.2 |
| Crack-control max c/c spacing | min(380·280/fs − 2.5cc, 300·280/fs), fs=⅔fy | same | same | 24.3.2 |
| Skin reinforcement (h > 900) | required | required | required | 9.7.2.3 |
| Clear cover | ≥ 40 mm | ≥ 40 mm | ≥ 40 mm | 20.6.1.3.1 |

**B · Dimensional limits (SRPMK only)**

| Rule | SRPMB | SRPMM | SRPMK | Clause |
|---|---|---|---|---|
| Clear span Lₙ | — | — | ≥ 4d | 18.6.2.1 |
| Web width bw (lower) | — | — | ≥ min(0.3h, 250 mm) | 18.6.2.1 |
| Web width bw (upper) | — | — | ≤ c₂+min(c₂,0.75c₁) — *not modeled (no column geometry)* | 18.6.2.1 |

**C · Shear — concrete capacity**

| Rule | SRPMB | SRPMM | SRPMK | Clause |
|---|---|---|---|---|
| Vc, **with** ≥ Av,min | 0.17λ√f'c·bw·d | same | same (0 in hinge ↓) | 22.5.5.1 |
| ⚑ Vc, **without** Av,min | 0.17λ√f'c·bw·d (no size effect) | same | — | 22.5.5.1 |
| √f'c cap | ≤ 8.3 MPa | same | same | 22.5.3.1 |
| Vc in end (hinge) zone | full | full | **0** | 18.6.5.2 |
| φVmax cross-section ceiling | φ(Vc + 0.66√f'c·bw·d) | same | same | 22.5.1.2 |
| Av,min/s | max(0.062√f'c, 0.35)·bw/fyt | same | same | 9.6.3.4 |
| Stirrups required when | Vu > ½φVc | same | same | 9.6.3.1 |
| Av/s required | max((Vu−φVc)/(φ·fyt·d), Av,min/s) | same | same | 22.5.10.5 |

**D · Shear — design demand & transverse detailing**

| Rule | SRPMB | SRPMM | SRPMK | Clause |
|---|---|---|---|---|
| Design shear Vdesign | envelope Vu | max(Vu, Ve); Ve=(Mn_i+Mn_j)/Lₙ + Vg | max(Vu, Ve); Ve=(Mpr_i+Mpr_j)/Lₙ + Vg, Mpr@1.25fy | 18.4.2.3 / 18.6.5.1 |
| Confined hoop region | — | 2h from face | 2h from face | 18.4.2.4 / 18.6.4.1 |
| First hoop from face | — | ≤ 50 mm | ≤ 50 mm | 18.4.2.4 / 18.6.4.1 |
| Max spacing — end/hinge zone | min(d/2, 600); → min(d/4, 300) if Vs>0.33√f'c·bw·d | min(d/4, 8db_long, 24db_hoop, 300) | min(d/4, 6db_long, 150) | 9.7.6.2.2 / 18.4.2.5 / 18.6.4.4 |
| Max spacing — midspan | min(d/2, 600) | d/2 | d/2 | 9.7.6.2.2 / 18.4.2.6 / 18.6.4.6 |
| db_long basis | — | smallest primary flexural bar | smallest primary flexural bar | 18.4.2.5 / 18.6.4.4 |
| Lateral bar support hₓ | — | — | ≤ 350 mm | 18.6.4.2 |
| Min hoop size | ≥ D10 (practice) | ≥ D10 | ≥ D10 | 25.7.1 |

> SRPMB (OMF) carries no Chapter-18 seismic detailing — it is pure Chapter 9/22
> (the 18.3.3 SDC-B continuity rule is not modeled). All "—" cells reflect this.

### 9.2 ACI 318-25 — selectable alternative

Identical to [§9.1](#91-sni-28472019--aci-318-14--main-code) **except the three ⚑ rows below**. Sub-tables B and D are
byte-identical to SNI and are not repeated.

**A · Materials, flexure capacity & longitudinal limits** (⚑ rows shown; all other rows = §9.1.A)

| Rule | OMF | IMF | SMF | Clause |
|---|---|---|---|---|
| ⚑ Tension-controlled limit εₜ | **εty + 0.003** | **εty + 0.003** | **εty + 0.003** | 21.2.2 / Table 21.2.2 |
| ⚑ Singly cₘₐₓ (derived) | εcu/(εcu+εty+0.003)·d (**≈0.370d** @ fy420) | same | same | 21.2.2 |

**C · Shear — concrete capacity** (⚑ row shown; all other rows = §9.1.C)

| Rule | OMF | IMF | SMF | Clause |
|---|---|---|---|---|
| ⚑ Vc, **without** Av,min | **0.66·λs·λ·ρw^(1/3)·√f'c·bw·d** (formula c), λs=√(2/(1+d/250))≤1 | same | — | 22.5.5.1 / 22.5.5.1.3 |

Everything else (As,min, β1, φ, moment floors, ρ≤0.025, continuity, dimensional
limits, Ve, all transverse spacing, cover, skin reinforcement) is **exactly as in
§9.1** — only the strain limit, the cₘₐₓ it drives, and the no-stirrup Vc change.

**Implementation map.** SMF/SRPMK ρ≤0.025 + continuity → `checkArrangement`;
dimensional limits → `checkBeamDimensions` (Lₙ = node-to-node length; live in the
RC tool from the shortest span using the section); 2h confined region = the
end-zone model; Ve / Vc / spacing → `strategy.ts::designZoneShear` + the code
module's `vc` / `governingSpacingMax`.

> **Validation status:** the numeric anchor (`validation/rc_beam_verify.mjs`,
> bound to SNI) is an **SRPMK/SMF** worked example (Contoh 5-A/5-B); the ACI 318-25
> ⚑ deltas are anchored in `rc_beam_aci31825.mts`. SRPMB/SRPMM (OMF/IMF) follow the
> same code text and share the engine but are not separately anchored to a
> published example yet.


---

## 11. Validation

| Script | Anchors |
|--------|---------|
| `validation/rc_beam_verify.mjs` | Book Contoh 5-A/5-B (SMF, 350×600, f'c 30, fy 420): `As = 2224 mm²`, `Mpr = 552.9 kN·m`, `Ve = 234.03 kN`, `Aᵥ/s = 1417 mm²/m → D10@100`; β₁ clamps, As,min, φ-ramp endpoints, analytic zone extremes vs dense sampling (25 assertions). |
| `validation/strain_compat_check.mts` | Strain-compat ≡ Whitney on the single-layer case; Mpr parity; compression steel; 2-layer bracketing; side-bar capacity gain; auto-overflow geometry (50 mm clear, centroid, corner placement); transverse spacing caps + Vs threshold (16 assertions). Run via `npx tsx --tsconfig config/tsconfig.json …`. |
| `validation/rc_column_verify.mts` | Book Contoh 5-C (600×600, f'c 30, fy 420, 20D25): `Po = 13050 kN`, `φPn,max = 6786 kN`, balanced/tension-control/pure-moment/pure-tension coordinates (B −2594/856, C −1394/1068, D 0/855, E +3710), demand (−1435, 625) inside the φ curve, polygon cap edge, and column engine ≡ `phiMnBars` at pure bending (26 assertions). **Imports the `sni2847-19` module** (the book is an SMF/318-14 example). Run via tsx. |
| `validation/rc_beam_aci31825.mts` | ACI 318-25 ↔ SNI deltas: `Vc` formula (a) with min stirrups vs **formula (c)** `0.66·λs·ρw^⅓·√f'c·bw·d` without (and ρw=0 fallback), `epsTC` = εty+0.003 vs fixed 0.005 (fy 420 ≈ book As; fy 550 → ACI φ < SNI φ in transition), `√f'c ≤ 8.3` cap (fc 80, both modules), and frame checks (SMF ρ=2.56% fails 18.6.3.1; ln<4d fails 18.6.2.1). Run via tsx with the **root** tsconfig. |
| `validation/rc_column_phases.mts` | Column shear/confinement/slenderness/spiral engine (SNI module): `columnFlexuralStrengthAtP(P=0)` ≡ pure-bending Mn, Mpr > Mn, Vc axial benefit, OMF/IMF/SMF confinement check-sets distinct, δns = 1 below the 6.2.5 gate and = `Cm/(1−Pu/0.75Pc)` above, spiral cap 0.85 / φc 0.75 lift. Run via tsx. |
| `validation/rc_column_aci_deltas.mts` | Column ACI 318-25 ↔ SNI deltas: `columnShearVc` λs (no ties, ratio = λs; equal with ties), confinement **3-eq vs 2-eq** `Ash` (ACI > SNI when the 0.2·kf·kn·Pu term governs; equal at low axial), εt control-point `c` (εty+0.003 vs 0.005 at fy 550; ≈ at fy 420). Run via tsx. |
| `validation/rc_column_scwb.mts` | Strong-column-weak-beam + frame distinctness end-to-end (`runDesign` on the portal): SMF emits joint checks with ΣMnc/1.2ΣMnb ratios, OMF/IMF emit none; SMF columns carry Ve + confinement, OMF columns design for Vu only. Run via tsx with the **root** tsconfig. |
| `validation/rc_column_circular.mts` | Circular column engine (SNI module, D 500, f'c 30, 8·D25 spiral): closed-form `concreteBlock` ≡ **independent strip numerical integration** of `Mn` at three neutral-axis depths (<2%), `Po = 0.85f'c(Ag−Ast)+fy·Ast` with `Ag=πD²/4`, spiral `Pn,max = 0.85·Po`, shear `d = 0.8·D`, spiral ρs row (25.7.3.3), and ≥6-bar detailing (10.7.3.1). Run via tsx with the **root** tsconfig. |

Required-mode flexure and the SMF shear path are **byte-stable** against the book
anchors (now bound to the `sni2847-19` module) — changes to the strain-compat /
checked path must keep them passing.

---

## 12. Extending the engine — concrete

The pipeline (`runDesign` → demands → flexure → shear → detailing) is
material-agnostic in its *shape*. Adding new capability means adding strategies,
not rewriting the orchestrator.


### 12.1 New concrete section shapes (T, L, hollow)
**Circular columns are implemented** (v1.1.3) — see §12.2 — and serve as the
worked template for this pattern. To add another shape:
1. The section must already exist as a parametric shape (`lib/sections/`).
2. Broaden `isSectionDesignable` / `DESIGN_SUPPORT` to admit the new `shape.kind`.
3. Generalise the compression-zone model. The **column** path already does this:
   `sectionForcesAtC` consumes a `ColumnGeom` discriminator and delegates the
   concrete resultant to `concreteBlock(geom, a, fc)` → `{ Cc, arm }` (rect =
   `0.85f'c·b·a`, circle = a closed-form circular segment). A new shape adds a
   `ColumnGeom` variant + a `concreteBlock` branch (and `geomAg/geomIg/geomAch/
   geomLeastDim/geomShear` cases) — the rest of the interaction engine is
   shape-agnostic. The **beam** path's `phiMnBars` still assumes a rectangular
   block; factor it the same way (`{ Cc(c), yc(c) }`) when a non-rectangular
   *beam* is needed.
4. Bar layout (`buildBarLayout` / `buildColumnBarLayout`) is position-based;
   extend it to place bars on the actual outline (circular columns use a single
   circumferential ring).

### 12.1b Circular columns (v1.1.3)
Reinforced-concrete **circular columns** are designed via the same engine as
rectangular, keyed by `ColumnGeom = { kind:"circle", D }`:
- **Concrete block** — the compression zone is a **circular segment** of depth
  `a = β₁c`: area `A = R²·acos(m/R) − m·√(R²−m²)`, centroid above the section
  centre `arm = ⅔(R²−m²)^{3/2}/A`, with `R = D/2`, `m = R − a`. `Cc = 0.85f'c·A`.
  Validated against independent strip integration (`rc_column_circular.mts`).
- **Geometry** — `Ag = πD²/4`, `Ig = πD⁴/64`, `Ach = π(D/2−cover)²`,
  `leastDim = D`; **shear** uses `bw = D`, `d = 0.8D` (22.5.2.2).
- **Bars** — a single circumferential ring of `n` bars (`d = R − rs·cosθ`).
- **Confinement** — spiral ρs `max(0.45(Ag/Ach−1)f'c/fyt, 0.12 f'c/fyt)`
  (25.7.3.3 / 18.7.5.4) + pitch 25–75 mm (25.7.3.1); circular ties use the hoop
  caps; min bars ≥ 6 spiral (10.7.3.1) / ≥ 4 tied. **Spiral** raises `Pn,max` to
  `0.85·Po` and φc to 0.75 (22.4.2.1 / 21.2.2).
- **Boundaries** — circular sections are **column-only** (no circular-beam
  strategy); a single bar ring (no inner rings). Rectangular columns are now
  **tied-only** — spiral on a rectangular core was removed (not code-correct).

### 12.2 Columns (axial + in-plane flexure) — implemented
The P–M interaction capacity (v1.1.1) plus, in the current pass, **capacity-design
shear, transverse confinement, strong-column-weak-beam, non-sway slenderness, and
spiral** columns — all per frame type (SRPMB/SRPMM/SRPMK ↔ OMF/IMF/SMF) and both
codes ([§5b.5](#5b5-capacity-design-shear-confinement-scwb-slenderness-spiral)).
**Still open:** sway (δs) / computed-k slenderness, and biaxial out-of-plane
bending — a permanent boundary of the 2D model (one bending axis).


---

*Cross-references:* the material-agnostic core (designability, element-type
resolution, demands, orchestration, canvas output) is in
[`DESIGN_RULES.md`](DESIGN_RULES.md); steel is in
[`DESIGN_STEEL.md`](DESIGN_STEEL.md). Solver sign conventions and the analysis
pipeline are in [`CLAUDE.md`](../CLAUDE.md) and
[`docs/ARCHITECTURE.md`](ARCHITECTURE.md); the user-facing walkthrough is in
[`docs/USER_GUIDE.md`](USER_GUIDE.md).
