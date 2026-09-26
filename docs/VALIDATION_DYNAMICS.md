# Validation of the analysis engine (closed form)

`scripts/verify-dynamics.ts` checks the solver, the modal analysis, the three
earthquake methods and the document format against references written out
independently in the script from their formulas. The app's own output is
never used as its own reference.

```
npm run verify:dynamics              # run every benchmark, exit 1 on any failure
npm run verify:dynamics -- --update  # rewrite the static baseline fixture
```

Units follow the app: kN, m, t for results; sections in MPa, mm², mm⁴.
g = 9.80665 m/s². A check passes when |got − want| ≤ tol · |want|.

## 1. Static regression

Templates 1 to 5 and a braced frame are analysed with Euler–Bernoulli and with
Timoshenko members. The full results (displacements, reactions, member end
forces) must be **deep-equal** to `scripts/fixtures/static-baseline.json`, which
was captured before the dynamic features were added. Any change to static
results, however small, fails this check. Rewrite the fixture with `--update`
only after a deliberate, reviewed change to the static solver.

## 2. Modal: cantilever with a tip weight

A vertical cantilever (E 30 000 MPa, I 8×10⁹ mm⁴, A 3×10⁵ mm², L 3 m) carries
its weight W only at the tip, so the lumped model is an exact SDOF in sway:

T = 2π √(m L³ / 3EI),  m = W / g

| Check | Tolerance |
|---|---|
| T₁ | 1e-9 |
| Σ X participation over all modes = 1 | 1e-12 |

## 3. Modal: two-storey shear building

Two storeys of 3 m, one 6 m bay, columns E 200 000 MPa and I 2×10⁸ mm⁴, beams
with I = 10¹⁶ mm⁴ (rigid in bending) and A = 10⁹ mm² everywhere (axially rigid),
500 kN at each floor node. The frame then behaves as a shear building with
storey stiffness k = 2 · 12EI / h³ and floor mass m, whose 2×2 eigenproblem has

λ₁,₂ = (k/m)(3 ∓ √5)/2,  mode 1 shape φ₂/φ₁ = (1 + √5)/2 (the golden ratio).

| Check | Tolerance | Why not tighter |
|---|---|---|
| T₁, T₂ | 1e-5 | the beams and columns are very stiff, not infinitely stiff |
| φ₂/φ₁ of mode 1 | 1e-5 | same |
| Σ X participation = 1 | 1e-12 | all modes are kept |

## 4. Static equivalent (ELF), SNI 1726:2019

The frame of benchmark 3 with Ss 1.0, S1 0.4, site SD, risk category II
(Ie 1), R 8 and the empirical period of a concrete moment frame. The script
recomputes from the code tables: Fa 1.1, Fv 1.9, SDS = ⅔·Fa·Ss,
SD1 = ⅔·Fv·S1, Ta = 0.0466 · hₙ^0.9, Cs within its upper and lower bounds,
V = Cs·W, the exponent k and Fx = V · wₓhₓᵏ / Σ wᵢhᵢᵏ per node.

| Check | Tolerance |
|---|---|
| SDS, SD1, Ta, Cs, W, V, Fx at both floors | 1e-12 |
| Σ horizontal base reactions = −V | 1e-9 |

## 5. Response spectrum (MRS)

The design spectrum Sa(T) is rewritten in the script (rising branch, plateau,
1/T and T_L branches).

- **5a.** Cantilever, a single mode: V = Γ² · Sa(T) · g · Ie / R, where Γ² is
  the effective modal mass (mass-normalised mode shape). Tolerance 1e-9.
- **5b.** Two-storey frame: the base shear is combined with an independent CQC
  (Der Kiureghian's ρᵢⱼ at ζ = 5 %) over every mode that participates in X.
  Tolerance 1e-9. The scale factor must equal max(1, V_ELF / V_MRS), tolerance 1e-9.
- **5c.** Station-wise moment. For every member, the moment at each of the 21
  stations is recovered mode by mode, combined by the independent CQC and
  scaled; the app's |M| at the same stations must match. The error is measured
  against the member's peak moment, not the local value, since the local value
  tends to zero near an inflection point. Tolerance 1e-9.

## 6. Linear time history (LTH), El Centro 1940 NS

- **6a.** Cantilever: the peak tip displacement must equal Chopra's Newmark
  recurrence for an SDOF (average acceleration, Δt 0.02 s, ζ 5 %), written out
  in the script. Tolerance 1e-9.
- **6b.** Two-storey frame, direct integration against an independent modal
  superposition: each mode is integrated by the same SDOF recurrence with
  ζₙ = α/(2ωₙ) + βωₙ/2 from the app's Rayleigh coefficients, then summed. For
  classical damping and the same Δt the two are algebraically identical, so the
  roof displacement is compared at **every step**, relative to its peak.
  Tolerance 1e-10.

  This benchmark uses ordinary beams (I equal to the columns) and a finite
  axial area (10⁵ mm²), not the rigid frame of benchmark 3. The rigid frame's
  stiffness spread of about 10¹¹ costs roughly seven digits of round-off
  (the difference there is 4e-8); the realistic frame agrees to 2.5e-13, which
  shows the rigid-frame gap is conditioning, not a solver error.
- **6c.** Rayleigh damping: at both fit modes (mode 1 and the mode that brings
  cumulative X participation to 90 %, or the next X-participating mode when
  mode 1 already does) ζ must equal the requested 5 %.
  Tolerance 1e-12.

## 7. Document format

- A document with every feature (Modal mass source, ELF, MRS and LTH cases,
  combinations, combination settings, an imported ground motion, design
  criteria and section inputs) is serialised, parsed and compared deep-equal
  with the original.
- A legacy file holding only the bare model still opens, on the legacy path.

## What this suite does not cover

It is closed form only. It does not compare against commercial software, it
does not check the design checks (see `DESIGN_RC.md` and `DESIGN_STEEL.md`),
and it does not exercise the UI. The static regression guards the solver
against unintended change but cannot prove the baseline itself correct; the
static solver was validated separately before this suite existed.
