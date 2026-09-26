# DESIGN_STEEL.md — Structural Steel Design (AISC 360-16 / SNI 1729:2020)

The structural-steel half of the Design tab. The material-agnostic machinery that
feeds it — designability, element-type resolution, demands, the run orchestrator
— is in [`DESIGN_RULES.md`](DESIGN_RULES.md). Reinforced concrete is in
[`DESIGN_RC.md`](DESIGN_RC.md).

> **Section numbers are shared across the three design documents.**
> `DESIGN_RULES.md` holds §1–§4, §10, §12 and §13; `DESIGN_RC.md` holds
> §5–§9, §11 and §12.1–§12.2; this file holds **§S1–§S14**.

`SteelDesignCode` is a single combined edition, `"AISC360-16_SNI1729-2020"`.
SNI 1729:2020 is an adopted translation of AISC 360 with no formula deltas that
reach this engine, so unlike RC there is **no `codes/<code>/` split** — one
module set serves both. Clause numbers below are AISC 360-16.

The implementation follows the AISC 360-16 text clause by clause. Where a clause
is ambiguous, or a worked example disagrees with the equation it illustrates, the
resolution is named explicitly
in [§S8](#s8-combined-forces-chapter-h) and [§S14](#s14-open-issues--known-defects-not-fixed) rather than silently resolved.

---

## S1. Scope & status

| Shape | Beam | Column | Chapter F | Interaction | Status |
|---|---|---|---|---|---|
| **IWF** (parametric, treated as **built-up/welded**) | ✅ | ✅ | F2 / F3 | H1 | Implemented |
| **RHS** (sharp-cornered welded **box**) | ✅ | ✅ | F7 | H1 | Implemented |
| **CHS** (round HSS / pipe) | ✅ | ✅ | F8 | H1 | Implemented |
| **Tee** (WT, singly symmetric) | ✅ | ✅ | **F9** | H1 (+M) / **H2** (−M) | Implemented |
| **Angle** (single, equal **and unequal** legs) | ✅ | ✅ | **F10** | **H2** always | Implemented |
| Double angle | — | — | — | — | Not in the target matrix |

Steel has **no "As required" / "As checked" split**. There is no rebar-style
unknown to solve for, so every run is a *check* of the assigned section. Section
selection from a catalogue is not implemented.

Every steel member runs the **same combined-force check** regardless of its role
tag — unlike RC there is no separate beam and column formulation, only different
demands. This follows from how AISC 360 is organised ([§S11.2](#s112-member-role)), and it is
why the role is **inferred from geometry and read-only**, and why steel carries
**no per-section design input at all** ([§S11.3](#s113-fixed-member-parameters)).

**Two shapes break the "one Mn per section" assumption** the other three hold to,
and most of the tee/angle work is a consequence of that:

- A **tee** is singly symmetric, so its capacity depends on the **sign** of the
  moment — stem-in-tension and stem-in-compression are different limit-state
  ladders with different caps ([§S6.3](#s63-f9--tees-the-sign-dependent-shape)).
- A **single angle**'s principal axes do **not** coincide with the geometric axis
  the solver bends about, so one geometric moment produces **two** principal
  components ([§S3.1](#s31-the-angle-carve-out--one-moment-two-components)).

---

## S2. Module map & data flow

```
src/lib/design/steel/
├── criteria.ts       SteelCriteria { code, Fy, Fu, E, phiB, phiV, phiC }
│                     + defaultSteelCriteria
├── types.ts          (no per-section input — documents why)
├── member-role.ts    inferSteelRole() — beam / column / brace from geometry
├── rules.ts          steelGeom() + classifyFlexure/classifyAxial
│                     (Table B4.1b / B4.1a), kc()
├── compression.ts    E3 flexural buckling, E4 torsional / flexural-torsional
│                     (E4-2 / E4-3 / E4-4 cubic), E7 effective width/area,
│                     D2 tension yielding
├── flexure.ts        F2/F3 (I-shape + LTB), F7 (box), F8 (round),
│                     F9 (tee, sign-dependent), F10 (angle, principal axes),
│                     cbFactor, lpLength, lrLength, fcrLTB
├── shear.ts          G2 (I-shape), G4 (box), G5 (round), G3 (tee + angle)
├── interaction.ts    H1-1a / H1-1b, H1.2 tension, h2Ratio (H2-1, unsymmetric).
│                     H1.3 is deliberately NOT implemented — see §S8.1
├── section-props.ts  resolveSteelSection() + steelFlexureInput() — the single
│                     mapping from a Section to Chapter F/E inputs, shared by
│                     the strategy AND the report decks
└── strategy.ts       designMemberSteel() — station sweep, envelope, result

src/lib/sections/shapes/
└── principal.ts      Exact rectangle-composition geometry: area/second/THIRD
                      moments, principal axes, βw, torsionStrip. Shared by
                      angle.ts, tee.ts and iwf.ts.

src/tabs/design/tools/
├── chart-text.tsx    SVG label typography (FONT, SubText) — all four decks
├── chart-utils.ts    Deck/chart geometry, colours, fmt0/fmt, niceStep/ticks
└── steel/            STEEL flyout — see §S11.1
    ├── steel-design-tool.tsx   router
    ├── preview.tsx             live cross-section (+ principal axes on an angle)
    ├── deck.tsx                portal shell, UtilBar, LadderRow
    ├── beam/report.tsx         Mn-vs-Lb curve + limit-state ladder
    └── column/report.tsx       H1/H2 interaction envelope + Chapter E ladder
```

**Flow.** `core/run-design.ts` dispatches a member to `designMemberSteel()` when
`materialOf(section) === "steel"`. The strategy then:

1. resolves `Fy` (section strength wins over criteria, so a model can mix grades)
   and `E`;
2. builds the AISC geometry via `steelGeom(kind, dims)`;
3. **probes `flexuralStrength` once** to test clause scope, and refuses the
   member if it is out of scope ([§S10](#s10-refusals--sections-the-engine-declines-to-design));
4. computes the station-independent capacities — `PcComp`, `PcTens`, `Pcy`, `Vc`;
5. walks **11 stations × every enabled combination**, recomputing flexure per
   combination (Cb depends on the moment diagram) and the interaction ratio per
   station;
6. reports the governing station.

---

## S3. Applicability & the 2D scope boundary

A steel section is designable when `DESIGN_SUPPORT` marks its
(material × geometry × element) row implemented **and** the geometry check
passes: `Fy > 0`, `E > 0`, `A > 0`, and `derived.{S33b, Z33, r22} > 0`.

**One bending DOF.** OpenAnstruk's frame element has a single bending DOF, so the
**geometric** minor-axis moment `Mu22 ≡ 0` for every member, always. Three
consequences, all **exact** rather than approximations — there is no input that
could make the dropped terms non-zero:

- **F6** (minor-axis flexure) is unreachable and absent.
- **G6** (minor-axis shear) is unreachable and absent.
- The `Mr22/Mc22` term of H1-1a/H1-1b is identically zero and is dropped, as is
  H1.3's `Mr22/Mc22 ≤ 0.05` negligibility gate — the condition it
  tests is satisfied by construction.

Compression still checks **both** axes: weak-axis flexural buckling is an
independent limit state and usually the governing one, even though bending is
strong-axis only.

### S3.1 The angle carve-out — one moment, two components

**The three bullets above hold for the four symmetric shapes. They do not hold
for a single angle**, and the difference is structural rather than cosmetic.

An angle's principal axes sit at `α` to its geometric axes — exactly 45° when the
legs are equal. The solver bends the member about the **geometric** axis 3, so a
moment that is uniaxial to the analysis is genuinely **biaxial to the section**:

```
Mw =  M33·cos α + M22·sin α        (major principal)
Mz = −M33·sin α + M22·cos α        (minor principal)
```

With our `M22 ≡ 0` that reduces to `Mw = M33·cos α`, `Mz = −M33·sin α`. For an
equal-leg angle both are `0.707·M33`, and since `Iz ≈ Iw/4` the **minor**
component usually dominates. A single angle bent about a geometric axis really is
very weak — a large D/C on an angle beam is the correct answer, not a bug.

This is why an angle is checked with **H2** ([§S8.2](#s82-h2--unsymmetric-members))
rather than H1, and why `sections/shapes/angle.ts` carries a `principal` block.
The strategy branches on the **presence of that block**, not on the shape name, so
a future unsymmetric shape inherits the path.

> **The known 2D boundary.** In a 3D analysis an unsymmetric section under
> in-plane load develops a genuine **out-of-plane** moment `M22`, which
> *partially cancels* `Mz`. A one-bending-DOF element cannot produce that moment,
> so our `M22 = 0` gives the larger `|Mz|` and the D/C is conservative. This is a
> permanent property of the 2D model, not a defect to fix ([§S14](#s14-open-issues--known-defects-not-fixed)).

---

## S4. Section classification (Table B4.1a / B4.1b)

`steelGeom(kind, dims)` maps a parametric section to AISC's width-thickness
inputs. The mapping is where two shape conventions are pinned down:

- **IWF** — `hw = h − 2tf`. Treated as **built-up (welded)** throughout, which is
  why `kc` appears in the flange λr and why φv = 0.90 rather than the rolled-shape
  1.00 shortcut ([§S7](#s7-shear-chapter-g)).
- **RHS** — a **sharp-cornered welded box**, flat width `b − 2t`, `hw = h − 2t`.
  AISC B4.1b(d) permits "outside dimension minus three times the thickness" when
  the corner radius is unknown, but that allowance exists for **cold-formed HSS**,
  which have a radius. `sections/shapes/rhs.ts` computes its properties from
  `bi = b − 2t` with no radius, so using 3t here would contradict our own section
  geometry *and* understate λ, which is unconservative for classification.
- **CHS** — `λ = D/t`.

`kc = 4/√(h/tw)`, clamped `0.35 ≤ kc ≤ 0.76` (Table B4.1b note a).

### S4.1 Flexural limits (Table B4.1b)

| Shape | Element | λ | λp | λr | Case |
|---|---|---|---|---|---|
| IWF | flange | `b/(2tf)` | `0.38√(E/Fy)` | `0.95√(kc·E/FL)`, `FL = 0.7Fy` | 11 |
| IWF | web | `hw/tw` | `3.76√(E/Fy)` | `5.70√(E/Fy)` | 15 |
| RHS | flange | `b/tf` | `1.12√(E/Fy)` | `1.40√(E/Fy)` | 17 |
| RHS | web | `hw/tw` | `2.42√(E/Fy)` | `5.70√(E/Fy)` | 19 |
| CHS | wall | `D/t` | `0.07E/Fy` | `0.31E/Fy` | 20 |
| Tee | flange | `bf/(2tf)` | `0.38√(E/Fy)` | `1.0√(E/Fy)` | 10 |
| Tee | stem | `d/tw` (**full depth**) | `0.84√(E/Fy)` | `1.52√(E/Fy)` | 14 |
| Angle | each leg | `b/t`, `d/t` (full width) | `0.54√(E/Fy)` | `0.91√(E/Fy)` | 12 |

Three notes on the two new rows:

- **The tee flange uses the ROLLED row (case 10), not the built-up case 11** our
  IWF uses. That asymmetry is deliberate: AISC F9.3 references case 10 directly,
  and a WT is
  physically made by splitting a rolled I-shape. No `kc` appears.
- **A tee stem is measured over the FULL nominal depth** `d/tw`, not `h − tf`
  (Table B4.1b case 14, `d` the full depth of the tee). It is an unstiffened
  element free along its lower edge, not a
  plate framed between two flanges.
- **An angle leg is classified on its full width** `b/t`, with no half-width.
  AISC B4.1a(a)(2): for legs of angles the width `b` is the full leg dimension. Both
  legs are checked and the worse governs, which matters once legs may be unequal.

### S4.3 A tee is classified by the sign of the moment

Table B4.1b classifies **compression** elements. A tee has only one element in
compression at a time, so `classifyFlexure` takes a `momentSign`: sagging
classifies the flange alone, hogging the stem alone. The same section can
therefore report two different classes: a WT300×200 classifies as "Compact"
sagging and "Non-Compact" hogging. The reported
`sectionClass` is the one at the **governing station**.

> **Why the box flange uses 1.40 and not 1.49.** Table B4.1b also carries a
> λr = 1.49√(E/Fy) row (case 18), and since `steelGeom` models this shape as a
> welded box that row can look like the match. It is not, and F7-2 says why: its constants are
> calibrated against 1.40. At `λ = 1.40√(E/Fy)`,
> `3.57·λ·√(Fy/E) − 4.0 = 3.57·1.40 − 4.0 = 1.0` **exactly**, so F7-2 lands
> precisely on `My` and hands over to F7-3 with no step. Paired with 1.49 the
> bracket reaches 1.319, F7-2 undershoots `My`, and the F7-2 → F7-3 handover
> opens a 0.16 % upward discontinuity — caught by the monotonicity check in
> `validation/steel_boundary_sweep.mts`. AISC Table B4.1b case 17, which
> Chapter F7 actually references, covers "rectangular HSS **and boxes** of
> uniform thickness" in one row at 1.40. The 1.49 row, case 18, covers
> cover/diaphragm plates between lines of welds, which is not the case F7 is
> written against.

### S4.2 Axial limits (Table B4.1a)

Compression has no "compact" tier — only nonslender and slender. Cases 2 (I-shape
flange, with `kc`), 5 (I-shape web), 6 (box walls, λr = `1.40√(E/Fy)`) and 9
(round HSS, λr = `0.11E/Fy`) are implemented. The **axial** box row is 1.40 in
Table B4.1a case 6, which covers HSS and boxes together, so no ambiguity arises
there.

---

## S5. Axial

### S5.1 Tension (D2)

`Pn = Fy·Ag` (D2-1), `φt = 0.90`. **Rupture on the net section (D2-2) is not
checked**: `Ae` would need a connection model with bolt holes, which does not
exist here, so `Ae = Ag` always ([§S13](#s13-not-implemented--deferred-scope)).

### S5.2 Compression (E3)

```
Fe  = π²E / (KL/r)²                                   (E3-4)
Fcr = 0.658^(Fy/Fe) · Fy      if Fy/Fe ≤ 2.25         (E3-2, inelastic)
    = 0.877 · Fe              otherwise               (E3-3, elastic)
Pn  = Fcr · Ae
```

Both axes are evaluated (`KL33/r33`, `KL22/r22`) and the **larger slenderness
governs**. The `Fy/Fe ≤ 2.25` test is algebraically the same branch point as
`KL/r ≤ 4.71√(E/Fy)`. `KL/r > 200` raises an advisory, not a rejection — 360-16
makes it a user note, not a limit.

**A single angle uses `rz` for both axes.** The minimum (principal) radius of
gyration `rz` replaces `r22` and `r33` in `KL/r`, which is conservative and is
the E3 route taken in place of E5 ([§S13](#s13-not-implemented--deferred-scope) item 9).
E4 below still uses the true `rw`/`rz` pair.

### S5.2a Torsional and flexural-torsional buckling (E4)

`Fe = min(Fe_flexural, Fe_torsional)`, so E4 can only ever **lower** a capacity.
Skipped for closed sections (box, pipe) per AISC E4 scope and its user note:
torsional buckling does not govern closed HSS.

```
r̄0² = x0² + y0² + (I22 + I33)/Ag                              (E4-9)
H   = 1 − (x0² + y0²)/r̄0²                                      (E4-8)
Fez = [π²E·Cw/(Kz·Lz)² + G·J] / (Ag·r̄0²)                       (E4-7)

doubly symmetric (IWF)  Fe = [π²ECw/(KzLz)² + GJ]/(I22+I33)    (E4-2)
singly symmetric        Fe = ((Fea+Fez)/2H)·[1 − √(1 − 4·Fea·Fez·H/(Fea+Fez)²)]
                                                                (E4-3)
unsymmetric             Fe = lowest root of the cubic           (E4-4)
```

**Which `Fe` goes into E4-3 follows from where the shear centre sits**, not from
the shape's name. E4-4 factors as

```
(Fe−Fe33)(Fe−Fe22)(Fe−Fez) − Fe²(Fe−Fe22)(x0/r̄0)² − Fe²(Fe−Fe33)(y0/r̄0)² = 0
```

so `x0 = 0` leaves the `(Fe−Fe22)` factor and a quadratic in **`Fe33`**, while
`y0 = 0` leaves one in **`Fe22`**. A **tee** is symmetric about 2-2, so its offset
is `y0` and E4-3 takes `Fe22`. An **equal-leg angle** is symmetric about its
*major principal* axis, so its offset is `x0 = w0` and E4-3 takes `Fe33`.

> **The tee case uses the axis of symmetry throughout.** The numerator
> `(Fe22 + Fez)` and the radicand denominator come from the same quadratic, so
> they must use the same axis. AISC E4-3 with 2-2 as the axis of symmetry gives
> the denominator `(Fe22 + Fez)²`, and that is what is implemented.

**E4-4 is solved by bisection**, and the bracket is *proved*, not assumed: the
cubic is `−Fe33·Fe22·Fez < 0` at `Fe = 0`, and at `Fe = min(Fe33, Fe22, Fez)` one
factor vanishes while both subtracted terms carry a non-positive factor, so the
value is `≥ 0`. A sign change always exists between them.

> **The two branches report different quantities, deliberately.** E4-3 divides out
> the decoupled factor — a pure *flexural* mode AISC covers through E3 — and
> returns only the coupled root. E4-4 keeps every root, because for a genuinely
> unsymmetric section none of them decouple. They reconcile because
> `compressionStrength` takes `min(Fe_flexural, Fe_E4)`, so the flexural mode is
> counted exactly once either way. `steel_angle_tee_clauses.mts` asserts that as
> an invariant (`Pn` continuity across the branch), not as a comment.

**Kz = K22 and Lz = the full member length.** Nothing that shortens `Lb` is
taken to shorten `Lz`: lateral bracing does not by itself imply torsional
restraint, so the full length is the conservative value.

Enabling E4 for the IWF closed the residual risk previously recorded in §S13;
the existing 15/15, 14/14, 86/86 and 21/21 anchors were re-run and are unchanged,
confirming it does not govern for a sanely proportioned I-shape.

### S5.3 Slender elements (E7)

360-16 replaced 360-10's `Q = Qs·Qa` factor approach with one **effective-width**
rule applied to stiffened and unstiffened elements alike. Only `c1` distinguishes
element types.

```
Fel = (c2·λr/λ)² · Fy                                 (E7-5)
be  = b·(1 − c1·√(Fel/Fcr))·√(Fel/Fcr) ≤ b            (E7-3)
c2  = (1 − √(1 − 4c1)) / (2c1)                        (E7-4)
```

applied only when `λ > λr·√(Fy/Fcr)`; otherwise `be = b`. `Fcr` is computed on
the **gross** section first, then used to size the effective widths.

**Table E7.1 has three rows:**

| Case | Slender element | c1 | c2 | Used for |
|---|---|---|---|---|
| (a) | Stiffened elements **except** walls of square/rectangular HSS | **0.18** | 1.31 | IWF **webs** |
| (b) | Wall of square and rectangular HSS | **0.20** | 1.38 | RHS/box **walls** |
| (c) | All other elements | **0.22** | 1.49 | IWF flange **outstands** |

> A built-up I-shape web is a stiffened element that is not an HSS wall, so it is
> **row (a), c1 = 0.18**, the code value. AISC Example 0002's
> `c1 = 0.18 / c2 = 1.31` is simply row (a).

**Effective area for an I-shape web** is `Ae = Ag − (h − be)·tw`. AISC Example
0002 typesets this as `Ag − 2·be·tw`, which evaluates to 13.45 in² against the
19.1 in² the same page prints; implementing the formula as written yields
**φPn ≈ 350 kips, 30 % low**. The printed *number* follows the correct form, and
so do we.

**Round HSS (E7-6 / E7-7) has three branches:**

```
D/t ≤ 0.11E/Fy            →  Ae = Ag
0.11E/Fy < D/t < 0.45E/Fy →  Ae = [0.038E/(Fy·D/t) + 2/3] · Ag
D/t ≥ 0.45E/Fy            →  Ae = 0  → member REFUSED
```

The third branch is a **rejection**, not a capacity: E7-7 defines `Ae` only for
`D/t < 0.45E/Fy`, so beyond that limit there is no capacity to report and the
section is not designed. The comparison is `>=` rather than `>`, so a section at
exactly `0.45E/Fy`, outside E7-7's open range, is refused as well.

---

## S6. Flexure (Chapter F)

Internal arithmetic is **N, mm, MPa**; moments cross the API boundary in **kN·m**.

| Shape | Clause | Limit states |
|---|---|---|
| IWF, compact web | **F2** | yielding, inelastic LTB, elastic LTB |
| IWF, noncompact/slender flange | **F3** | + flange local buckling |
| RHS / box | **F7** | yielding, FLB, WLB — **no LTB** |
| CHS / round | **F8** | yielding, local buckling — **no LTB** |
| Tee | **F9** | yielding, LTB, FLB **or** WLB — **sign-dependent** |
| Single angle | **F10** | yielding, LTB, leg local buckling — **on principal axes** |

### S6.1 I-shape lateral-torsional buckling

```
Mp = Fy·Z33                                           (F2-1)
Lp = 1.76·r22·√(E/Fy)                                 (F2-5)
Lr = 1.95·rts·(E/0.7Fy)·√(Jc/(S33·ho))
     · √(1 + √(1 + 6.76·((0.7Fy/E)·(S33·ho/Jc))²))    (F2-6)
```

with `c = 1.0` for doubly-symmetric I-shapes (F2-8a). Then:

- `Lb ≤ Lp` → `Mn = Mp` (F2-1)
- `Lp < Lb ≤ Lr` → `Mn = Cb·[Mp − (Mp − 0.7FyS33)·(Lb−Lp)/(Lr−Lp)] ≤ Mp` (F2-2)
- `Lb > Lr` → `Mn = Fcr·S33 ≤ Mp`, `Fcr` per F2-4 (F2-3)

`J`, `Cw`, `rts` and `ho` come from `sections/shapes/iwf.ts`. **`J` uses the
per-strip finite-aspect-ratio correction** `J = ⅓·Σ bᵢtᵢ³(1 − 0.63·tᵢ/bᵢ)`. The
uncorrected `⅓Σbt³` overestimates `J` — by 3.7 % for a 400×200×13×8 shape — which
inflates `Lr` and `Fcr` and so the LTB capacity. The corrected form gives
`J = 343 907 mm⁴` for that shape.

### S6.2 Cb policy (F1-1)

```
Cb = 12.5·Mmax / (2.5·Mmax + 3·MA + 4·MB + 3·MC) ≤ 3.0
```

`MA`, `MB`, `MC` are absolute moments at the quarter, mid and three-quarter
points of the **unbraced segment**.

`Cb` is **always computed, never entered.** Because `Lb` is always the full
member length ([§S11.3](#s113-fixed-member-parameters)), the member *is* its own
unbraced segment, so the quarter-point moments come from its own diagram and
F1-1 is exact. It is re-evaluated per load combination, and the governing
station keeps the `Cb` that produced it.

There is no user override, and no `Lb < L` fallback branch — the condition
cannot arise. (Earlier revisions carried both: an override field, and a
`Cb = 1.0` fallback for a shortened `Lb`, because the full-member value is *not*
a conservative stand-in for a shorter segment — on a moment-reversing member the
full-member `Cb` reaches 2.273 against a true end-segment value of 1.25.)

Two clause-level exceptions stand: **F9** (tees) and **F10** (single angles)
carry no `Cb` term at all, and F10 pins it to 1.0. The result reports the value
the clause actually used, not the diagram-derived one.

### S6.3 F9 — tees, the sign-dependent shape

`sections/shapes/tee.ts` puts the flange on **top**, and this catalogue maps
section `+y` to member `+local-2`. A positive (sagging) moment therefore puts
tension on `−local-2` — the section bottom, the **stem tip** — so `M ≥ 0` is
AISC F9's *"stem in tension"* branch and the flange is the compression element.
`S33b` is the stem-side modulus, `S33t` the flange-side one.

| | `M ≥ 0` — stem in **tension** | `M < 0` — stem in **compression** |
|---|---|---|
| Yielding | `Mp = Fy·Z33 ≤ 1.6My` (F9-2) | `Mp = Fy·Z33 ≤ My` (F9-4) |
| LTB | plateau → interpolate → `Mcr ≤ Mp` (F9-1/F9-6/F9-7), `B = +2.3(d/Lb)√(Iy/J)` | `Mn = Mcr ≤ My` (F9-13), `B = −2.3(d/Lb)√(Iy/J)` (F9-12) |
| FLB | F9-14 / F9-15, `S33c = S33t` | not considered |
| WLB | not considered | F9-16, `Fcr` three-branch on `d/tw` (F9-17…19), `S33b` |

`My = Fy·min(S33t, S33b)` — first yield, which for a tee is the stem tip.

The stem-in-compression branch has **no plateau**: F9-13 binds at every `Lb`. As
`Lb → 0`, `Mcr → ∞` and `Mn → My`, so it stays continuous with yielding, and the
opposite sign of `B` collapses the bracket `B + √(1+B²)` toward zero instead of
letting it grow. That is what makes a hogging tee so much weaker — measured at
**31.4 vs 60.0 kN·m** on the same WT300×200 in `steel_pipeline_smoke.mts`.

> **F9-9's radical grouping.** AISC F9-9 has `√(Iy·J)` **over** `Sx`, giving
> `mm⁴/mm³ = mm`, as `Lr` must be a length. Grouping it as `√(Iy·J/S33)` would
> give `√(mm⁴·mm⁴/mm³) = mm^2.5`, which is dimensionally impossible. Unlike F2-6 there is no nested radical. Implemented as AISC
> writes it and asserted dimensionally in the clause sweep.

> **F9's stem-buckling branches do not join, and that is the code's doing.** At
> `d/tw = 1.52√(E/Fy)`, F9-18 gives `0.6472·Fy` and F9-19 gives `Fy/1.52 =
> 0.6579·Fy` — a **1.65 %** step; at the lower limit the step is 0.26 %. The
> rounded constants were never calibrated to meet, unlike F7-2/F7-3 which land on
> `My` exactly at `λr = 1.40√(E/Fy)`. The sweep asserts the step stays *small and
> as printed* rather than pretending it is absent.

> **F9-10's bracket is evaluated in conjugate form on the hogging branch.**
> `B + √(1+B²)` catastrophically cancels when `B ≪ 0`, which is exactly the
> stem-in-compression case at short `Lb` — `B` scales as `1/Lb`, so once `B²`
> exceeds `1/ε` the root rounds to `|B|`, the bracket evaluates to **0**, and
> `Mn` collapses to zero instead of tending to its true limit. On a WT300×200 at
> `Lb = 1 µm` the naive form returns `Mn = 0.000` against the correct `52.593
> kN·m`, and `Mn(Lb)` stops being monotonic. The algebraically identical
> `1/(√(1+B²) − B)` has no cancellation for negative `B`. Found by the UI render
> smoke test, whose `Mn`-vs-`Lb` curve samples `Lb → 0`; now asserted directly in
> the clause sweep, which previously started its monotonicity scan at
> `Lb = 100 mm` and never reached the regime.

### S6.4 F10 — single angles, on the principal axes

Computed on the principal pair, one capacity per axis, returned as `MnW`/`MnZ`:

```
Yielding : Mn = 1.5·My,  My = Fy·SwMin (or SzMin)               (F10-1)
LTB (major principal axis only):
  My/Mcr ≤ 1 : Mn = (1.92 − 1.17√(My/Mcr))·My ≤ 1.5My           (F10-2)
  My/Mcr > 1 : Mn = (0.92 − 0.17·Mcr/My)·Mcr                    (F10-3)
  Mcr = (9EA·rz·t·Cb)/(8Lb)·[√(1 + (4.4βw·rz/(Lb·t))²) + 4.4βw·rz/(Lb·t)]  (F10-4)
Leg local buckling (both axes):
  compact / noncompact (F10-7) / slender (F10-8)
```

The **minor principal axis has no LTB** (F10.2 addresses the major principal
axis only), so `MnZ` is just
yielding capped by leg local buckling.

- **`βw` is taken adverse.** AISC F10.2 makes it positive with the short leg in
  compression and negative with the long leg in compression; a 2D check cannot
  know which toe is in compression over the whole unbraced length, and both
  principal signs occur along a real member. We use `−|βw|`, the conservative
  sign. `βw` is exactly **0** for equal legs, collapsing F10-4 to
  `Mcr = 9EA·rz·t·Cb/(8Lb)`.
- **`Cb` is pinned to 1.0 for angles.** F10.2 allows `Cb` from F1-1, capped at
  1.5 for single angles. `Mcr` is linear in `Cb`, so the diagram-derived value
  would raise `Mcr` by up to 50 %. We take `Cb = 1.0`, which F1 permits in all
  cases as the conservative value.
- **`Sc` is the worst extreme fibre** (`SwMin`/`SzMin`) over every real polygon
  vertex, heel included, so yielding at the heel **and** at both leg tips is
  considered (F10.1). On the minor axis that value is set by the heel. On the
  **major** axis a thin-walled idealisation would measure to the leg-tip
  mid-thickness instead, giving an `Sw` 5.2 % larger than ours. See
  [§S14.1 C](#s141-known-conservative-simplifications-tee--angle).
- **F10-4 vs the legacy `0.46·E·b²·t²`.** For an equal-leg angle `βw = 0` and
  F10-4 collapses to `9EA·rz·t·Cb/(8Lb)`. That is the *same equation* AISC
  360-05/10 printed as F10-5, since `0.46 = 9/8 · 2/√24 = 0.45928` is just the
  thin-wall evaluation of `9·A·rz·t/8`. 360-16 writes it in terms of the actual
  `Ag`, `rz` and `t`, which is what we use. That is 9.5 % lower than the `0.46`
  shortcut, i.e. conservative.

### S6.5 `MnNoLTB`

`flexuralStrength` returns `MnNoLTB` alongside `Mn` — the yielding/local-buckling
capacity with the LTB limit state excluded. It is **reporting only**: the beam
deck's limit-state ladder shows it so a reader can see how much capacity LTB is
costing on this member. No check consumes it.

(A companion `MnCb1` — the same evaluation with `Cb` forced to 1.0 — existed for
AISC H1-2 and was removed with the H1.3 alternative; see
[§S8.1](#s81-h13-is-not-implemented).)

---

## S7. Shear (Chapter G)

| Shape | Clause | `kv` | `Aw` |
|---|---|---|---|
| IWF | G2 | 5.34 (unstiffened web) | `d · tw` (**overall** depth) |
| RHS | G4 | 5.0 | `2 · h_flat · t` (both webs) |
| CHS | G5 | — | `Fcr = 0.6E/(D/t)^1.5 ≤ 0.6Fy`, `Vn = Fcr·Ag/2` |
| Tee | **G3** | **1.2** | `d · tw` (**full** nominal depth) |
| Angle | **G3** | **1.2** | `d · t` — the leg **parallel to the shear** |

`kv = 1.2` is far below an I-shape's 5.34 because a tee stem and an angle leg are
unstiffened along a free edge rather than framed between two flanges.

Chapter G is evaluated on the **geometric** axes even for an angle (G3 works on
the leg resisting the shear), so the solver's local-2 `V` feeds straight in, with
no principal-axis resolution.

**`φv = 0.90`**, the general value. The `φv = 1.00` rolled-shape shortcut of
G2.1(a) is deliberately **not** used: our parametric IWF is not a catalogue
rolled shape and is treated as built-up everywhere else in this engine.

---

## S8. Combined forces (Chapter H)

```
Pr/Pc ≥ 0.2 :  Pr/Pc     + (8/9)·(Mr33/Mc33) ≤ 1.0    (H1-1a)
Pr/Pc < 0.2 :  Pr/(2Pc)  +        Mr33/Mc33  ≤ 1.0    (H1-1b)
```

The `Mr22/Mc22` term is dropped as identically zero ([§S3](#s3-applicability--the-2d-scope-boundary)).
The same two-branch form serves axial **tension** (H1.2) with `Pc = φt·Pn`.

When `|Pr| < 1e-9` the check degenerates to `Mr33/Mc33` and is reported as
`equation: "flexure-only"`.

### S8.2 H2 — unsymmetric members

```
| f_ra/F_ca + f_rbw/F_cbw + f_rbz/F_cbz | ≤ 1.0                 (H2-1)
```

Applied to **every single angle**, and to a **tee under negative major-axis
moment** (stem in compression). For the tee this is a deliberate conservative
choice: H2's linear sum is harsher than H1.

H2-1 is written in stresses, but each flexural term is `(Mr/S)/(φMn/S)` and the
section modulus **cancels identically**, so the check reduces to the moment form
`Pr/Pc + Mrw/Mcw + Mrz/Mcz`. That is an algebraic identity, not an approximation.

Terms are summed as **absolute** ratios — every component taken adverse. This
pairs correctly with the min-over-all-fibres capacities of
[§S6.4](#s64-f10--single-angles-on-the-principal-axes): the total is a plain
linear sum of the major and minor principal ratios.

Note that with no minor-axis moment H2 degenerates to `Pr/Pc + Mr33/Mc33` — a
straight linear interaction, **harsher** than H1-1a's 8/9 factor and H1-1b's
`Pr/2Pc`. A hogging tee therefore gets a stiffer check than the same tee sagging,
which is the intent of routing it to H2. Angles and tees are not granted the H1.3
alternative.

### S8.1 H1.3 is not implemented

**Every member is checked with H1.1 (or H2).** The H1.3 alternative — checking
in-plane instability and out-of-plane buckling (H1-2) as separate limit states —
is **deliberately absent**.

This is conservative by construction. H1.1 is the general provision and is always
permitted; H1.3 is an optional relaxation, so declining it can only *raise* the
reported D/C. Measured cost on a compact IWF at `Lb = 0.8 Lr`:

| `Pr/Pc` | H1-1 (reported) | H1.3 would give | Relief forgone |
|---------|-----------------|-----------------|----------------|
| 0.03 | 0.5168 | 0.3696 | 28% |
| 0.14 | 0.5673 | 0.4427 | 22% |
| 0.27 | 0.7135 | 0.6174 | 13% |
| 0.47 | 0.9153 | 0.8454 | 8% |

**It was removed rather than corrected**, which is the part worth recording. The
previous implementation had two defects pointing in opposite directions:

1. It took `min(in-plane, out-of-plane)` where AISC requires **both** limit
   states to be satisfied — i.e. `max`. **Unconservative**, by up to 18.9%.
2. Its in-plane branch used the governing (weak-axis) `PcComp` where the clause
   calls for the strength "determined in the plane of bending". **Conservative**,
   and large: 0.7259 against 0.4471 at `Pr = 600 kN`.

Defect 2 was masking defect 1 — fixing only the `Pc` would have taken the error
at that load from −6.2% to −42%. Neither had any validation coverage; the sole
H1.3-adjacent assertion tested a `Cb` double-count, not the branch selection.
Deleting the clause removes the class rather than trading three fixes for a
relaxation the engine does not need.

Applicability was also an open question: AISC H1.3 is titled *"Doubly
Symmetric **Rolled** Compact Members…"* and this engine models its parametric IWF
as built-up throughout, so the clause would not strictly apply to it. That
question is now moot.

`validation/steel_boundary_sweep.mts` §K asserts the removal — no axial level may
produce an `H1-2` result.

---

## S9. Demands, stations, and the design run

The interaction equation needs the axial force and the moment **acting
together**, so nothing may be enveloped independently. `strategy.ts` walks
**`N_STATIONS = 11`** uniformly spaced stations on every enabled combination,
evaluates `memberInternalForces` at each, and keeps the station with the worst
ratio. The eleven stations include both ends and midspan.

Solver `N` is tension-positive; AISC `Pr` is compression-positive, so `Pr = −N`.

Shear is enveloped separately as `max|V|` over the same sweep — it has no
interaction partner.

> **Asymmetry with RC, by design.** RC uses the exact analytic zone extremes of
> [§4](DESIGN_RULES.md#4-demands); steel uses uniform station sampling. The
> `raw: MemberZoneDemands` object is still threaded into the steel strategy and
> is currently unused ([§S14](#s14-open-issues--known-defects-not-fixed)).

---

## S10. Refusals — sections the engine declines to design

A capacity produced by the wrong clause is worse than no capacity. Where a
section falls outside an implemented clause, `flexuralStrength` /
`compressionStrength` set a flag, `strategy.ts` returns
`status: "not-implemented"` with a human-readable `note`, and
`core/run-design.ts` surfaces that note as a run issue so the refusal is never
silent.

| Condition | Why it is refused | Was, before |
|---|---|---|
| IWF with a **noncompact web** | AISC **F4** (`Mn = Rpc·My`, own `Lp` per F4-7) not implemented | F2 returned `Mn = Mp`, **4.1 % unconservative**, and F4's `Lp` is 28 % shorter so more unbraced length sat on a false plateau |
| IWF with a **slender web** | AISC **F5** (`Rpg` reduction) not implemented | Already refused |
| Section missing **`J` / `rts` / `ho`** with `Lb > 0` | LTB cannot be evaluated | LTB was silently skipped, `Mn = Mp` — **17.8× unconservative** at `Lb = 60 m`. Reachable from real user data: model JSON saved before those properties existed loads clean and passes designability |
| CHS with `D/t ≥ 0.45E/Fy` | Outside AISC F8's stated range and outside E7.2 | F8 kept returning numbers — 40 413 kN·m at 3× the limit |
| Box web where F7-5 yields `Mn ≤ 0` | F7-5's bracket grows without bound; past `h/t ≈ 324` the raw value goes negative | Negative `Mn` propagated; `Mc33 < 0` became `Infinity` D/C — a fail for the wrong reason |
| Tee missing **`J`** or **`I22`** with `Lb > 0` | F9's LTB cannot be evaluated | — (new shape) |
| Angle missing the **`principal` block** | F10 is written on the principal axes; without them there is nothing to compute | — (new shape) |
| Any steel shape with **no `steelGeom` mapping** | Cannot be classified | Returned `not-implemented` **with no `note`**, so the member vanished from the results silently. Now carries a reason |

`Lb = 0` is **not** a refusal: it means continuously braced, so LTB genuinely
does not apply.

---

## S11. Criteria, inputs, results & UI

**`SteelCriteria`** (STEEL tool → PREFERENCES pane — global): `Fy`, `Fu`, `E`,
`phiB` = 0.90, `phiV` = 0.90, `phiC` = 0.90. A section carrying its own
`strength.fy` overrides `Fy` per member, so a model can mix grades.

`frameType` exists on the type but has **no UI and no effect** — AISC 341-16
seismic detailing is not implemented, and offering OMF/IMF/SMF would imply a
check that does not run.

**There is no per-section steel design input.** `SteelSectionInput` is gone: it
carried `elementType`, `Lb`, `Cb`, `K33` and `K22`, and all five were removed —
the first because role is inferred ([§S11.2](#s112-member-role)) and the rest
because they are computed or fixed ([§S11.3](#s113-fixed-member-parameters)). RC
still has one; `SectionDesignInput` is now an alias for `RcSectionInput`.

**`SteelDesignResult`** carries `sectionClass`, `axialClass`, `ratio`,
`equation`, `governing {combo, x, Pr, Mr}`, `PcComp`, `PcTens`, `Mc33`, `Vc`,
`Pn`, `Mn`, `Mp`, `Vn`, `Lp`, `Lr`, `Lb`, `Cb`, `flexureLimit`, `Fe`, `Fcr`,
`Ae`, `slenderness`, `slendernessAxis`, `Vr`, `shearRatio`, `PrMax`, `MrMax`,
`pass`, `warnings`, `role`, plus the **presentation block** the report decks
read: `pmPairs` (every `(P, M)` actually checked), `McW`/`McZ`/`MrW`/`MrZ`
(angle), `McPos`/`McNeg` (tee).

> **`Lp`, `Lr` and `Lb` are all in METRES** on the result object, consistent with
> its kN and kN·m. Chapter F works in mm internally. They were briefly mixed
> (mm for `Lp`/`Lr`, metres for `Lb`), which is a 1000× trap; the unit is now
> asserted in `steel_pipeline_smoke.mts`, not assumed.

### S11.1 The STEEL tool

`tabs/design/tools/steel/` mirrors the RC tool's shape — **router → preview →
per-kind report deck** — and shares no RC code path; only the material-agnostic
SVG and chart primitives (`tools/chart-text.tsx`, `tools/chart-utils.ts`,
`HDim`/`VDim`/`sectionFitScale`) are common.

| File | What it renders |
|---|---|
| `steel-design-tool.tsx` | Section picker, **read-only member role** per member, the fixed member parameters, governing-member summary, per-member D/C chips. No editable design input — see §S11.2/§S11.3 |
| `preview.tsx` | Live cross-section for all five shapes from `shape.dims` alone. An **angle also gets its principal axes drawn at `α`** — the clearest way to show why one geometric moment produces two components |
| `beam/report.tsx` | **`Mn` vs `Lb` curve** over `0 → 2Lr` with the three LTB zones shaded, `Lp`/`Lr` verticals, `φMp` reference and a marker at the member's own `Lb`; limit-state ladder; `φMn`/`φVn` utilisation bars. A **tee draws two curves** (sagging/hogging), an **angle draws `MnW` and `MnZ`** |
| `column/report.tsx` | **H1 interaction envelope** — exact and piecewise-linear, `M = (9/8)Mc(1 − Pr/Pc)` above `Pr/Pc = 0.2` and `M = Mc(1 − Pr/2Pc)` below, with the kink marked — every checked `(P, M)` pair plotted, plus the Chapter E ladder `KL/r → Fe vs Fez → Fcr → Ae → φPn`. An angle or hogging tee draws the **H2** line instead |

**No design math lives in the decks.** Every curve point comes from the same
`flexuralStrength()` / `compressionStrength()` the strategy calls, fed by the
shared `resolveSteelSection()` + `steelFlexureInput()` in
`lib/design/steel/section-props.ts`. The decks only choose which `Lb` to ask
about. That helper exists precisely so a deck cannot re-derive `S33`, `J` or the
principal block differently from the check it is describing.

**Canvas.** Members colour by the interaction D/C through the same generic
`worstFlexureDC` → `designColorForDC` path as RC ([§10](DESIGN_RULES.md#10-results--visualization)).
Under the default report: two rotated pills — D/C plus the governing AISC
equation on **+local-2**, shear on **−local-2**. The report dropdown's **Steel**
group (`stl-dc`, `stl-shear-dc`, `stl-capacity`, `stl-limit`, `stl-slender`) each
render one pill instead, and are **material-scoped**: an RC member renders
nothing under a `stl-*` report, exactly as a mode-mismatched RC member renders
nothing under `req-*`/`chk-*`.

`pass` uses **D/C ≤ 1.0**, the AISC unity check. No extra margin below 1.0 is
applied, since AISC requires none.

### S11.2 Member role

`lib/design/steel/member-role.ts`. Every steel member is labelled **beam**,
**column** or **brace**, inferred from its end coordinates:

```
|angle from horizontal| ≤ 15°  →  beam
|angle from vertical|   ≤ 15°  →  column
otherwise                      →  brace
```

`ROLE_ANGLE_TOL_DEG = 15` is a **declared convention, not a clause**. The rule reads `|Δx|`, `|Δy|`, so
it is invariant under swapping the member's i and j nodes.

**Role changes no capacity.** AISC 360 is organised by limit state (Chapters
D/E/F/G/H), not by member type: every member runs the same Chapter H check, and a
beam simply reaches it with `Pr = 0`, where H1-1b degenerates to `Mr/Mc`. A
simply supported beam with zero axial force therefore still reports equation
`(H1-1b)`, a zero axial ratio and a fully computed `PcComp`; the role selects no
equation.

Role therefore exists only to label the DESIGN SCHEDULE and to pick a report deck
(**brace uses the column deck** — like a column it is axial-dominated, so the
interaction envelope is the informative view). It is **read-only**: there is no
control, because a control would advertise an effect it does not have, and
because role is a per-MEMBER property that a per-section field cannot express
when one section serves both a beam and a column.

`validation/steel_member_role.mts` asserts the boundaries, the i↔j invariance,
and — the assertion that matters — that `ratio`, `equation`, `PcComp`, `Mc33`,
`Vc`, `Cb`, `Fcr` and `Fe` are **identical** across all three roles.

> **Known limitation.** A portal-frame rafter pitched more than 15° reads as
> `brace`, which is structurally wrong — it is a beam-column. Harmless while role
> is presentational. It becomes real with AISC 341, where a misclassified rafter
> would draw the wrong Table D1.1 ductility limits; the seismic axis there is
> SFRS membership, which is a user declaration rather than a geometric fact.

### S11.3 Fixed member parameters

Three quantities AISC needs are **fixed by documented convention** rather than
entered.

| | Value | Direction |
|---|---|---|
| `Lb` | the full member length | conservative |
| `Cb` | computed per combination (F1-1) | exact |
| `K33`, `K22` | 1.0 | **not conservative** — see below |

**`Lb` — every member is laterally unbraced over its full length.** Bracing is an
out-of-plane restraint and the model is 2D, so it cannot be inferred from the
geometry. **Subdividing a member is how bracing is expressed**: each sub-member
carries its own shorter `Lb`, and subdivision is analysis-neutral for a straight
member. Measured cost of not doing so, on a 6 m IWF400x200 (`Lp = 2.291 m`,
`Lr = 6.792 m`):

| bracing | `Lb` | `φMn` | vs unbraced |
|---|---|---|---|
| continuous (deck) | 0 m | 289.34 kN·m | +27.3% |
| third points | 2 m | 289.34 kN·m | +27.3% |
| mid-span only | 3 m | 272.25 kN·m | +19.8% |
| **unbraced (used)** | 6 m | 227.20 kN·m | — |

**`K = 1.0` limits the engine to BRACED frames.** ⚠ This is the one assumption
here that is *not* conservative. `K = 1.0` is what the AISC Direct Analysis
Method prescribes — but DAM also requires second-order analysis, reduced
stiffness (`0.8τb·EI`) and notional loads, and none of those exist here. A sway
column therefore gets an overestimated `Pc` and an underestimated D/C. The
exposure is pre-existing (there is no P-Δ analysis to fix it with) and removing
the input only made it unmitigable, which is why it is stated in the DESIGN
CRITERIA flyout and the STEEL tool rather than left to this document.

### S11.4 Seismic — AISC 341-16 / SNI 7860

`lib/design/steel/seismic.ts`. **Opt-in, and inert by default:** the framing type
defaults to OMF/RMB, for which `checkSeismic` returns `undefined` and the result
is byte-identical to a run with no seismic code at all. This is asserted, not
assumed — `validation/steel_seismic.mts` §B checks that `ratio`, `equation`,
`PcComp`, `Mc33`, `Vc` and `shearRatio` are unchanged between OMF and SMF.

**Moment frames only, three classes:**

| Frame | §  | Requirement |
|---|---|---|
| OMF / RMB (Biasa) | E1 | none — AISC 360 alone |
| IMF / RMM (Menengah) | E2 | moderately ductile sections + D1.2 beam bracing |
| SMF / RMK (Khusus) | E3 | highly ductile sections + D1.2 + SCWB (E3.4a) |

Braced-frame systems (OCBF/SCBF/EBF/BRBF) are **absent by design** — they need
the brace mechanism analyses of F2.3, which this engine cannot run.

**The code axis is labels only.** SNI 1729:2020 adopts AISC 360-16 and SNI 7860
adopts AISC 341-16, so no steel clause differs between the two editions;
`SteelCriteria.code` selects the framing nomenclature the user sees and nothing
else. This is **unlike the RC side**, where ACI 318-25 and SNI 2847:2019 genuinely
diverge — do not assume the steel pattern mirrors it.

**What is checked**

- **D1.1 / Table D1.1** — width-to-thickness against `λmd` or `λhd`, per element.
  The I-shape web is the only `Ca`-dependent row, with `Ca = Pu/(φc·Ry·Fy·Ag)`
  taken from the worst compression at any station.
- **D1.2** — beam bracing, `Lb ≤ coefficient·E·ry/(Ry·Fy)`. Reported as an
  **advisory**, because `Lb` is always the full member length
  ([§S11.3](#s113-fixed-member-parameters)): a failure here usually means the
  model has not been subdivided at its real brace points, not that the beam is
  deficient. The note travels with the result.
- **E3.4a SCWB** — `ΣM*pc / ΣM*pb > 1.0`, SMF only, as a joint post-pass sharing
  `DesignRunResult.joints` with the RC check. `JointCheckResult.material` says
  which rule produced the ratio.

**What is deliberately absent:** `R`, `Ωo` and `Cd`. Without overstrength load
combinations the amplified column demands of D1.4a cannot be formed, so
everything here is a **detailing** check on the section and the frame — "can this
member hinge, and will the mechanism form in the beams?" — never a force
question. Ductility folds into `pass` but **not** into `ratio`: D/C is a strength
quantity, and inflating it would misreport why a member failed. The canvas flags
it separately as `⚠D1.1`, the way RC flags `⚠Ash`.

> ### ⚠ S11.4.1 Coefficient provenance — read before relying on this
>
> **No copy of AISC 341-16 or SNI 7860 exists in this repository.** Every numeric
> limit in `seismic.ts` is transcribed from working knowledge and carries an
> `@unverified` tag at its definition. They are isolated in the `D1_1` and `D1_2`
> constants so correcting them is a single-file edit.
>
> `validation/steel_seismic.mts` therefore asserts **structure, not values**:
> class distinctness, `λhd < λmd` everywhere, monotonicity and continuity of the
> web limit in `Ca`, the floor, and the OMF inertness invariant. A coefficient
> typo survives most of that; a structural error does not.
>
> **It already caught one.** AISC writes the web's two `Ca` branches to meet at
> the break point. The moderate set closes to five decimals
> (`3.96(1−3.04·0.114) = 2.58762` vs `1.29(2.12−0.114) = 2.58774`); the highly
> ductile set leaves ~0.3% (`2.26530` vs `2.25808`), so **at least one of the
> four `high` web constants is mis-transcribed.** Recorded at the definition and
> bounded by §D of the suite rather than tolerated silently.
>
> `Ry` is a second known gap: A3.2 tabulates it **by ASTM designation**, and this
> engine has no grade field, so `expectedRy` infers it from `Fy`. That is a
> **program convention, not a code provision** — it is surfaced in the result and
> stated in the UI.

Also omitted from SCWB: the `Muv` term of `ΣM*pb`, which needs a plastic-hinge
location and therefore a connection model this engine does not have. Omitting it
makes `ΣM*pb` smaller and the ratio **optimistic** — a marginal joint here may not
comply. Reported rather than absorbed.

---

## S12. Validation

Two independent axes: published AISC worked examples, and independent
recomputation (exact polygon integration for section geometry, clause-by-clause
branch and continuity sweeps) that shares no code with the engine under test.

| Script | Anchors | Result |
|---|---|---|
| `validation/steel_flexure_verify.mts` | AISC 360-16 Example 0001 — W18x50, LTB at `Lb` = 5 / 11.667 / 35 ft spanning all three zones: flange & web λ/λp, `Lp` = 5.835 ft, `Lr` = 16.966 ft, `Mp` = 5050 k-in, `Cb` = 1.002 / 1.014 / 1.136, `φMn` = 378.750 / 306.657 / 94.218 k-ft. Feeds **catalogue** W18x50 properties, isolating the LTB math from our parametric geometry | **14/14** |
| `validation/steel_column_verify.mts` | AISC 360-16 Example 0002 — built-up W-shape with a **slender web**: `λ` flange 4.0 / web 60.0 vs `λr` 35.9, `KL/ry` = 86.6, `Fe` = 38.18 ksi, `Fcr` = 28.9 ksi, `c1` = 0.18, `be` = 12.6 in, `Aeff` = 19.1 in², `φcPn` = 497.9 kips | **15/15** |
| `validation/steel_boundary_sweep.mts` | Boundary, continuity and degenerate-input behaviour: E7 inert on compact sections, `Lb → 0 ⇒ Mn = Mp`, continuity across `Lp` and `Lr`, elastic-LTB tail, monotonicity of `Mn(Lb)` and `Pn(KL/r)`, CHS F8 branch continuity + the `0.45E/Fy` limit, RHS G4 `Cv2` across all three branches, F7 branch continuity, H1-1a ≡ H1-1b at exactly `Pr/Pc = 0.2`, and that no axial level yields an `H1-2` result (H1.3 removal) | **87/87** |
| `validation/steel_pipeline_smoke.mts` | End-to-end **wiring** through the real `runDesign()`: unit sanity, `Lp < Lb < Lr` branch agreement, pipeline `Mn` ≡ a direct capacity call, mixed RC + steel in one run, refusal paths. Asserts **invariants** (doubling the load doubles the D/C exactly; capacity is load-independent) rather than transcribed numbers, so it cannot reproduce a transcription error | **41/41** |
| `validation/steel_angle_tee_props.mts` | **Angle + tee section geometry**, every reference recomputed here by exact polygon contour integration (Green's theorem + 4-point Gauss-Legendre, exact for the degree-≤4 integrands), sharing no code with `principal.ts`. Covers `A, Ix, Iy, Ixy, α, Iw, Iz, Sw, Sz, βw`, shear centre, both leg orientations, the `{b,t}` back-compat path, and the `βw = 0` / `z0 = 0` identities for equal legs | **68/68** |
| `validation/steel_angle_tee_clauses.mts` | **F9 / F10 / E4 / G3 / H2 branch + continuity sweep.** F9 sign split and both LTB handovers, the F9-9 dimensional check, F10 branch continuity and the `βw = 0` collapse, `E4-4 → min(Fe22, E4-3)` plus `Pn` continuity across the branch, the cubic residual, G3's `Cv2` boundaries, and H2 ≥ H1 at three axial levels | **79/79** |
| `validation/steel_seismic.mts` | **AISC 341 detailing — structure, not coefficients** (see [§S11.4.1](#-s1141-coefficient-provenance--read-before-relying-on-this)). OMF produces no seismic block and an OMF run is byte-identical to an SMF run in every strength field; the three classes are distinct; every `λhd` is strictly below its `λmd` twin; the web limit is monotonic, continuous and floored in `Ca`; `Ca` round-trips through its own definition; tension gives `Ca = 0`; D1.2 applies to beams only; SCWB responds to axial and to the `1.1·Ry` beam term. **It is what found the mis-transcribed highly-ductile web coefficient** | **39/39** |
| `validation/steel_member_role.mts` | **Member role.** Classification at and around both 15° boundaries, i↔j swap invariance over 360 sampled angles, translation invariance, the degenerate zero-length case — and the invariant that matters: `ratio`, `equation`, `PcComp`, `PcTens`, `Mc33`, `Vc`, `shearRatio`, `Cb`, `Lb`, `slenderness`, `Fcr`, `Fe` are **identical** for the same member run as beam, column and brace. Also pins `Lb = L` and `Cb` = the F1-1 value | **31/31** |
| `validation/steel_ui_smoke.mts` | **Render smoke test for the STEEL UI.** `npm run build` type-checks the decks but never runs them, so a bad index or a divide-by-zero in a chart scale would ship silently. Renders the preview, both charts and the tool to static markup with `react-dom/server` across all five shapes plus the degenerate inputs a user can actually produce (shapeless section, `t ≥ leg`, zero dims, no result yet); asserts finite curve values, monotonic `φMn(Lb)` and no `NaN` in any SVG coordinate. **It is what found the F9-10 cancellation** ([§S6.3](#s63-f9--tees-the-sign-dependent-shape)). Also asserts the element-type control is *absent* and that a 45° member routes to the brace report | **94/94** |
| `validation/run_all.mjs` | Unattended aggregator: every `*.mts`/`*.mjs` suite + `npm run build` + `npm run lint` in one command. Lint is gated against a recorded baseline so a pre-existing hooks-rule error does not mask a new one | **20 suites** |

**Coverage across the five shapes.** The two published worked examples are both
I-shapes. RHS, CHS, tee and angle are covered by the independent geometry
recomputation in `steel_angle_tee_props.mts` and by the clause, continuity and
invariant sweeps above. The deliberate conservative simplifications specific to
the tee and angle are listed in
[§S14.1](#s141-known-conservative-simplifications-tee--angle).

**Orientation.** IWF, RHS and CHS are doubly symmetric, so an axis mix-up is
invisible in them; a tee and an angle would expose one. `steel_angle_tee_props.mts`
checks both leg orientations of an unequal angle, so a swapped axis fails there.

An **adversarial cross-check** was run in two blind halves — one agent
re-deriving both published examples without seeing the implementation, another auditing the
implementation clause by clause without seeing the derivation. Findings and
their resolutions are recorded in [§S10](#s10-refusals--sections-the-engine-declines-to-design)
and [§S14](#s14-open-issues--known-defects-not-fixed).

---

## S13. Not implemented — deferred scope

Everything below is **absent by decision**, not by oversight. Where a section
would otherwise be silently mis-designed, it is refused ([§S10](#s10-refusals--sections-the-engine-declines-to-design)).

| # | Item | What is missing | Why deferred |
|---|---|---|---|
| 1 | **Double angle** | Its own F9/E4 variants (AISC treats double angles alongside tees), plus a `SectionShape` entry and connector/spacing modelling | Not in the target matrix. The single angle now carries all the principal-axis machinery a double angle would reuse |
| 2 | **AISC 341-16 — the parts still absent** | Panel-zone shear, continuity and doubler plates, reduced beam section (RBS), protected zones, demand-critical welds, column splices; braced-frame systems (OCBF/SCBF/EBF/BRBF) and their brace mechanism analyses; `D1.4a` amplified column demands | Member ductility (D1.1), beam bracing (D1.2) and SCWB (E3.4a) **are now implemented** — see [§S11.4](#s114-seismic--aisc-341-16--sni-7860). What remains is either connection detailing (no connection model exists) or needs the overstrength load combinations that `R`/`Ωo`/`Cd` would bring |
| 3 | **AISC F4** — noncompact-web I-shapes | `Rpc` web-plastification factor, `Mn = Rpc·My`, `Lp` per F4-7 (uses `rt`, not `r22`), `Lr` per F4-8, compression-flange yielding / LTB / FLB / tension-flange yielding branches | Refused instead ([§S10](#s10-refusals--sections-the-engine-declines-to-design)). Common enough in a deep built-up girder that it is the most likely of these to be wanted next |
| 4 | **AISC F5** — slender-web I-shapes | `Rpg` bending-strength reduction and its four limit states | Refused instead. Rare in a sensibly proportioned member |
| 5 | **Tension rupture (D2-2)** | `Ae` from a net section: bolt-hole geometry, shear lag factor `U`, connection type | No connection model exists anywhere in OpenAnstruk. `Ae = Ag` and only yielding is checked |
| 6 | **Sway-frame K** | The sway-frame alignment-chart nomograph (AISC Commentary Appendix 7): joint-stiffness summation across the whole model and the `tan α` transcendental solve | `K33 = K22 = 1.0`, **fixed and not overridable** — the engine is limited to braced frames ([§S11.3](#s113-fixed-member-parameters)) |
| 7 | **Second-order amplification** | `B1` (member `P-δ`) and `B2` (storey `P-Δ`) multipliers of AISC Appendix 8 | The solver is first-order. For a sway-sensitive frame the user must supply amplified demands |
| 8 | **Torsion (H3)** | Box/pipe torsional strength, and combined torsion + shear + flexure | The 2D solver has no torsional DOF, so there is no torsional demand to check against. Permanent |
| 9 | **AISC E5** — single-angle end-condition slenderness | The modified `KL/r` of E5 for angles connected through one leg | Needs connection data (number of fasteners, which leg, restraint at the far end) that no model in OpenAnstruk carries. E3 on `rz` is used instead, which is conservative |
| 10 | **Angle out-of-plane moment** | The `M22` an unsymmetric section genuinely develops under in-plane load | **Permanent** — the frame element has one bending DOF. Our `M22 = 0` makes the minor-principal component larger, so the D/C is conservative ([§S3.1](#s31-the-angle-carve-out--one-moment-two-components)) |
| 11 | **Catalogue section selection** | Auto-selecting an economical shape from a section list | Steel is always a *check* of the assigned section. Selection would mean picking from a predefined section list, which is out of scope |
| 12 | **Intermediate lateral bracing** | A model concept for brace points along a member, so `Cb` and `Lb` could be resolved per segment | `Lb ≡ L` ([§S11.3](#s113-fixed-member-parameters)); subdividing a member is the workaround. Also what makes the AISC 341 D1.2 check advisory rather than binding |
| 13 | **Minor-axis flexure (F6), minor shear (G6), geometric `Mr22/Mc22`** | — | **Permanently** unreachable: one bending DOF means the *geometric* `Mu22 ≡ 0`. Exact, not an approximation — but note the angle carve-out at [§S3.1](#s31-the-angle-carve-out--one-moment-two-components), where a geometric moment still produces two *principal* components |
| 14 | **Steel in Save/Load** | Design criteria, section inputs and results are App state only | Same boundary as RC and as load cases/combinations ([§13](DESIGN_RULES.md#13-known-limitations)) |
| 15 | **In-app steel example** | None of the five static examples uses a steel section, so there is no one-click smoke test | A steel section must be authored via the MATERIAL tool to exercise the tab |

---

## S14. Open issues — known defects not fixed

Found and characterised, deliberately left open. Ranked by consequence.

### S14.1 Known conservative simplifications (tee + angle)

Four deliberate simplifications apply to the tee and the single angle. All four
are **conservative**: each gives a lower capacity or a higher D/C than a less
simplified treatment would, and each has a stated code basis.

| # | What we do | Effect | Why kept |
|---|---|---|---|
| A | **Angle D/C from in-plane `Mz` only.** The principal resolution uses the geometric `M22 = 0`; no out-of-plane `M22` is modelled | In a 3D analysis an out-of-plane `M22` would partially cancel `Mz`. With `M22 = 0` our `Mz` magnitude, and so the D/C, is the larger value | **Permanent** property of a one-bending-DOF element ([§S3.1](#s31-the-angle-carve-out--one-moment-two-components)). Ours is the larger, safe value |
| B | **Hogging tee: F9.4 stem local buckling applied.** Whenever the stem is in compression (`Mr < 0`), the three-branch `Fcr` of F9-17 to F9-19 is evaluated on `d/tw` | `McMajor` falls below `φ·Fy·S33` once `d/tw > 0.84√(E/Fy)`; at `d/tw = 55` the clause cuts capacity by 59 % | AISC F9.4 requires it. We follow the clause |
| C | **Equal-leg angle: F10 on exact polygon geometry**, not a thin-walled two-line idealisation. Two separable effects, see below | `McMajor` lower than the thin-wall evaluation would give | 360-16 F10-4 is written in terms of the *actual* `Ag`, `rz`, `t`. Ours follows the current edition and is conservative |
| D | **`J` for tee + angle without a plate-junction term.** `J = ⅓·Σ bᵢtᵢ³(1 − 0.63·tᵢ/bᵢ)` over the plates, with nothing added where they meet | `J` lower than a model with a junction or fillet allowance | Same reasoning as the RHS corner radius ([§S4](#s4-section-classification-table-b41a--b41b)): our geometry has no fillet, so our `J` should not assume one, and every formula here cites a clause. Lower `J` lowers `Lr` and `Mcr`, which is conservative |

**Simplification C in full.** The thin-walled idealisation differs from exact
geometry in two independent places:

1. **`My`**: the thin-wall model measures the major-axis modulus to the leg-tip
   **mid-thickness** fibre (`|z| = 67.175 mm` on the reference angle) instead of
   the real outer corner at `70.711 mm`. Its `Sw` is therefore **5.2 % larger**
   than ours.
2. **`Mcr`**: in the thin-wall limit `A → 2bt`, `rz → b/√24`, F10-4's
   `9·A·rz·t/8` becomes `0.46·E·b²·t²`, the **AISC 360-05/10 F10-5** form, since
   `0.46 = 9/8 · 2/√24 = 0.45928`. With the **real** `A` and `rz` the same
   equation gives `Mcr·Lb = 84 039 kN·m·mm` against about `92 000` for the `0.46`
   form, **9.5 % lower**.

For an **unequal-leg** angle F10-4 is always evaluated with the real `A` and
`rz`, so simplification C only changes the equal-leg case.

### S14.2 Standing issues

| # | Issue | Location | Consequence | Why open |
|---|---|---|---|---|
| 1 | **Advanced overrides desynchronise torsional properties.** `J`, `Cw`, `rts`, `ho` are neither editable nor recomputed when a user overrides `S33b`, `Z33`, `r22`, `I33` or `A` | `tabs/model/tools/material/advanced-panel.tsx` | LTB then mixes overridden section moduli with parametric torsional properties. **Silent** | Needs a decision on whether an override should invalidate derived properties or expose them for editing |
| 2 | **`Seff` in F7-3 is a linear scale**, `Seff = S33·(be/b)`, not the true effective section modulus | `flexure.ts` | Measured **10 % low** on a 300×300×6 box (528 463 vs 587 090 mm³). Conservative — under-reports capacity, never over | Honestly commented; the exact form needs the shifted neutral axis of the reduced section |
| 3 | `pass` uses **D/C ≤ 1.0**, with no extra margin | `strategy.ts` | Reporting only — no capacity changes | 1.0 is the AISC unity check; a lower design limit would be a product decision |
| 4 | `FlexureInput.I22` is **required but never read** by the I-shape / box / round branches | `flexure.ts` | None — the tee's F9 path does read it, so it is dead only for the other shapes | Cosmetic |
| 5 | `raw: MemberZoneDemands` is threaded into the steel strategy and **never destructured** | `strategy.ts`, `run-design.ts` | None. Steel uses 11 uniform stations; RC uses exact analytic extremes from that same object | An asymmetry, not an error |
| 6 | With an empty `efByCombo` the station loop never runs, `best.ratio` stays −1, and `pass` reports **true** with `worstFlexureDC = 0` | `strategy.ts` | None today — `run-design.ts` catches the empty case first | Unreachable; latent if that guard is ever removed |
| 7 | **`tee.ts` defaults are a concrete slab-beam** (`bf 1000, tf 100, bw 300, h 600`), not a steel WT | `sections/shapes/tee.ts` | A user picking a steel tee in the MATERIAL tool starts from an implausible section and must retype every dimension | `defaults` is shared between the concrete and steel paths; making it material-aware is a MATERIAL-tool change, not a design one |
| 8 | `S33b`/`S33t` mean **opposite ends** for a tee and an angle | `sections/shapes/{tee,angle}.ts` | None today — the angle path reads `principal.SwMin`/`SzMin` and never touches them. Latent if a future consumer assumes `S33b` is always the governing modulus | Renaming them to `S33min`/`S33max` would touch every shape and the persisted `derived` cache. Documented in both shape headers instead |
| 9 | **Six pre-existing ESLint errors** (`react-hooks/refs`, `react-hooks/immutability`) in `App.tsx` and `structural-canvas.tsx` | outside the design engine | None to design. They predate this work and are unrelated to it | `validation/run_all.mjs` gates lint against a recorded baseline (6 errors / 28 warnings) so a **new** problem still fails the suite. Lower the baseline when they are fixed; never raise it |

**Closed since the last revision.** An earlier entry claimed that `Sc` should be
taken over the two leg toes only, making our heel-inclusive `Sc` a conservative
simplification. It was **wrong** and has been removed: F10.1 considers yielding
at the heel *and* both leg tips, so the heel-inclusive value is simply the code
value. The remaining major-axis simplification is §S14.1 C.

---

*Cross-references:* the material-agnostic core is in
[`DESIGN_RULES.md`](DESIGN_RULES.md); reinforced concrete is in
[`DESIGN_RC.md`](DESIGN_RC.md). Solver sign conventions and the analysis pipeline
are in [`CLAUDE.md`](../CLAUDE.md) and [`docs/ARCHITECTURE.md`](ARCHITECTURE.md).
