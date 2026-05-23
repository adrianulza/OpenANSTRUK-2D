# Selfweight Stitches — v1.0.4

## Context

OpenANSTRUK-2D today carries a "Selfweight" load case as a locked placeholder: the type, the locked LoadCase row, the γ field on every Section, and the `solveCase("selfweight")` entry point are all in place — but the entry point returns `zeroResult(model)`, so no body force ever reaches the structure.

Wiring real self-weight into the existing pipeline exposes a deeper issue with how the app models trusses. Today `memberType: "truss"` is implemented as a **purist axial-only element** (`trussLocalStiffness` is zero in every bending row/column). That means a transverse load — including the member's own weight — has nowhere to go: the assembly path silently drops distributed loads on trusses, and member-weight lumped to nodes would force the truss to behave differently from how reference software/RISA/STAAD model the same element.

The user's reference (reference software screenshot, Warren truss with 3 m × 3 m bay geometry, 10 kN/m on one top-chord span) shows the correct physical behavior: the loaded truss member acts as a **simply-supported beam between its two end nodes**, producing a parabolic moment diagram peaking at qL²/8 = 10 · 3² / 8 = **11.25 kN·m**, while transmitting only axial force to the rest of the truss (end moments are zero). That is a **frame element with M3 releases at both ends**, not an axial-only element.

This release converts trusses to the reference software model and then implements self-weight as a synthetic global-Y distributed load applied uniformly across all members. The two changes are paired because self-weight on trusses only works once the truss formulation can carry transverse load.

**Outcome:** Selfweight, when enabled, contributes a correct reaction at every support; trusses display real internal V/M from any transverse loading (including self-weight); existing models without transverse loads on trusses produce bit-identical results; the load-case + combination plumbing flows self-weight into Dead-factor combos automatically; the V2.3 canary case reproduces the reference software peak moment of 11.25 kN·m exactly.

---

## Scope

### In scope
1. **Truss element refactor** — `memberType: "truss"` becomes "frame element with M3 releases at both ends" via static condensation of θᵢ, θⱼ from the full 6×6 frame stiffness.
2. **Self-weight body force** — replace the `solveCase("selfweight")` placeholder with synthetic global-Y distributed loads built from `Section.gamma · Section.A`.
3. **I=0 guard** — reject sections with I33 ≤ 0 at the Model tab input layer (manual + advanced). All built-in templates/examples already use I > 0 (verified: `examples.ts` uses I33 = 3,125,000 and 480,000,000; default sections in `model.ts` are all parametric with I33 > 0).
4. **Stability check** — simplify to a single `3m + r ≥ 3j` formula (the pure-truss branch becomes obsolete).
5. **Member-tool UI text** — update the truss help string to reflect the new semantics.
6. **Docs** — update CLAUDE.md, docs/ARCHITECTURE.md, docs/USER_GUIDE.md.

### Out of scope (DO NOT TOUCH)
- Solver sign conventions (`memberInternalForces` lines 370-381, the N/V/M extraction rules). CLAUDE.md flags these as load-bearing.
- Canvas SFD/BMD/AFD draw code — no `memberType` guards exist; the new behavior renders automatically.
- γ data plumbing — `Section.gamma`, parametric material γ values, manual-form γ input + validation, advanced-panel γ override — all already complete and end-to-end wired.
- LoadCase / LoadCombination types and the code-preset combo generator — Selfweight is `kind: "Dead"`, so combos auto-include it via the existing kind-matching path.
- Point-load handling, reaction recovery, transformation matrix, gaussSolve, fixedEndForces formula — used unchanged.

---

## Files to modify

| Path | Reason |
|---|---|
| [src/lib/solver.ts](src/lib/solver.ts) | Replace `trussLocalStiffness` with a condensed-frame element; condense FEF for the released DOFs; drop the `if (!isTruss)` distributed-load skip (line 190); drop the V/M hard-zero in end-force recovery (lines 339-343); revisit the `frameConnectedNodes` θ-pin block (lines 259-271). |
| [src/lib/analysis-pipeline.ts](src/lib/analysis-pipeline.ts) | Replace the `solveCase("selfweight")` zero-result placeholder (lines 82-85) with real synthetic-load synthesis. |
| [src/lib/model.ts](src/lib/model.ts) | Drop the `isPureTruss` branch in `stabilityOf` (lines 258-268). |
| [src/tabs/model/tools/material/manual-form.tsx](src/tabs/model/tools/material/manual-form.tsx) | Confirm I33 > 0 validation is active (already true via `numPos`); align the inline error message. |
| [src/tabs/model/tools/material/advanced-panel.tsx](src/tabs/model/tools/material/advanced-panel.tsx) | Add an I33 > 0 guard on the override commit path. |
| [src/tabs/model/tools/member-tool.tsx](src/tabs/model/tools/member-tool.tsx#L54) | Replace the "Pure axial only: pin-released both ends" help string with the new semantics. |
| `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/USER_GUIDE.md` | Reflect the new truss formulation, the self-weight pipeline, and the I=0 input rule. Bump version to v1.0.4. |

---

## Reusable utilities (leverage — do not reinvent)

- [src/lib/solver.ts:74](src/lib/solver.ts#L74) `localStiffness(EA, EI, L)` — the base 6×6 frame stiffness used inside the condensation.
- [src/lib/solver.ts:110](src/lib/solver.ts#L110) `fixedEndForces(q1, q2, L)` — the base FEF vector; the condensation consumes it unchanged.
- [src/lib/solver.ts:98](src/lib/solver.ts#L98) `transformMatrix`, plus `matMul`, `matVec`, `transpose` — used unchanged in both assembly and force recovery.
- [src/lib/solver.ts:370](src/lib/solver.ts#L370) `memberInternalForces` — already generic; renders V(x), M(x) along the span from q1, q2 + end forces. Works as-is for trusses post-refactor.
- [src/lib/sections/compute.ts:27](src/lib/sections/compute.ts#L27) `buildParametricSection` already populates `Section.gamma` for parametric concrete (24) and steel (78.5) — nothing to add on the section side.
- [src/lib/load-cases.ts:78](src/lib/load-cases.ts#L78) the locked Selfweight `LoadCase` exists with `enabled: false` default — consumed by [src/lib/analysis-pipeline.ts:107](src/lib/analysis-pipeline.ts#L107) `solveAllCases` which skips disabled cases.
- Combo machinery — preset combos match cases by `kind: "Dead"`, so an enabled Selfweight (kind=Dead) is automatically included in any Dead-factor combo. No combo plumbing changes needed.

---

## Step-by-step implementation order

Each step is independently buildable and verifiable. Stop at any step and run the verification matrix for that step.

### Step 1 — I=0 rejection at input boundary
Smallest, lowest-risk change. Lock down the precondition that the truss refactor depends on (static condensation requires EI > 0).

1. Confirm `validateManual` in [manual-form.tsx:46](src/tabs/model/tools/material/manual-form.tsx#L46) already requires `I33 > 0` via `numPos`. **Already true** — no code change, just verify the user can't bypass.
2. Apply the same guard on the advanced-panel commit path ([advanced-panel.tsx:82-93](src/tabs/model/tools/material/advanced-panel.tsx#L82)): if `parseFloat(buf.I33) <= 0`, refuse the commit and show a small inline error.
3. Verify all built-in templates ([src/templates/examples.ts](src/templates/examples.ts), [examples-data.ts](src/templates/examples-data.ts)) use I > 0. **Verified.**

### Step 2 — Truss element refactor (solver.ts only)
This is the load-bearing math change. Implement and verify in isolation before adding self-weight.

1. Add private helper `condensedTrussElement(EA, EI, L, q1, q2)` returning `{ K_loc: number[][]; FEF_loc: number[] }`.
   - Build `K_f = localStiffness(EA, EI, L)` (6×6) and `FEF_f = fixedEndForces(q1, q2, L)` (length 6).
   - Partition: retained DOFs `r = [0, 1, 3, 4]` (uᵢ, vᵢ, uⱼ, vⱼ), released DOFs `s = [2, 5]` (θᵢ, θⱼ).
   - Compute `K_ss⁻¹` analytically (2×2 — closed form, no Gauss needed): `det = K_ss[0][0]·K_ss[1][1] − K_ss[0][1]·K_ss[1][0]`; if `|det| < 1e-15` return null (caller treats as solver error — should be impossible after Step 1).
   - `K_cc = K_rr − K_rs · K_ss⁻¹ · K_sr` (4×4), then pad back to 6×6 with zero rows/cols at indices 2 and 5.
   - `FEF_cc = F_r − K_rs · K_ss⁻¹ · F_s` (length 4), padded back to length 6 with zeros at 2 and 5.

2. In the assembly loop ([solver.ts:174](src/lib/solver.ts#L174)): for `isTruss`, call `condensedTrussElement(...)` and use both its `K_loc` and `FEF_loc`. For frame, the path is unchanged.

3. Drop the `if (!isTruss)` guard at [solver.ts:190](src/lib/solver.ts#L190). Trusses now read q1/q2 from distributed loads the same way frames do.

4. Store the condensed FEF in `fefStore` for trusses, the regular FEF for frames. Critical: the SAME FEF must be used in force recovery as in assembly.

5. In end-force recovery ([solver.ts:309-316](src/lib/solver.ts#L309)): use the condensed K and condensed FEF for truss members. The resulting `f[2]` and `f[5]` (end moments) will be ~0 to machine epsilon by construction.

6. Remove the V/M zeroing ternaries at [solver.ts:339-343](src/lib/solver.ts#L339): `V1: -f[1]`, `M1: -f[2]`, `V2: f[4]`, `M2: f[5]` unconditionally. End moments naturally zero for trusses; transverse V/M non-zero when transverse load exists.

7. **`frameConnectedNodes` θ-pin block ([solver.ts:259-271](src/lib/solver.ts#L259)) — DEFERRED.** The condensed truss K has zero θ rows/cols, so pure-truss models will still have singular global K at truss-only nodes without this guard. Plan: **keep it for now** and revisit during implementation by running the templates with the guard removed first to confirm what actually fails. Most likely the guard stays (with an updated comment explaining the new semantics: "θ DOF carries no stiffness at nodes whose only connections are moment-released elements; pin to zero to keep K non-singular"). Mark with `TODO(selfweight-v1.0.4)`.

8. `memberInternalForces` ([solver.ts:370](src/lib/solver.ts#L370)) — no change. Already generic in q1/q2.

**Verify Step 2** (must pass before Step 3):
- V2.1 All five built-in templates (`template1SimpleBeam` through `template5AsymmetricRafter`) — reactions, displacements, end forces bit-identical to v1.0.3 (≤ 1e-6).
- V2.2 All six truss templates from `truss-template-modal.tsx` (Warren / Pratt / Howe / X-Braced / Roof Howe / Roof Fink) with their default point loads — axial forces and reactions bit-identical to v1.0.3.
- V2.3 **reference software canary**: Warren truss with 3 m × 3 m bay geometry, place a 10 kN/m global-Y distributed load on one top-chord truss member (span L = 3 m). Expected: **M_max at member midspan = qL²/8 = 11.25 kN·m**, M at both end nodes = 0, parabolic BMD shape. This number is independent of section properties (depends only on q and L), so it is a deterministic canary against the reference software screenshot value.

### Step 3 — Self-weight body force (analysis-pipeline.ts)
Now that trusses carry distributed loads correctly, replace the placeholder.

1. In `solveCase` ([analysis-pipeline.ts:82-85](src/lib/analysis-pipeline.ts#L82)), replace the placeholder block with:

   ```ts
   if (caseId === "selfweight") {
     const selfweightLoads: StructureModel["loads"] = {}
     for (const m of Object.values(model.members)) {
       const sec = model.sections[m.section]
       if (!sec) continue
       const gamma = sec.gamma ?? 0
       if (gamma <= 0) continue
       const w = gamma * sec.A * 1e-6  // kN/m, gravity acts in −Y
       const id = `sw_${m.id}`
       selfweightLoads[id] = {
         id, type: "distributed", memberId: m.id,
         loadCaseId: "selfweight",
         mode: "global-axis",
         wxStart: 0, wxEnd: 0,
         wyStart: -w, wyEnd: -w,
       }
     }
     const slice: StructureModel = { ...model, loads: selfweightLoads }
     const r = analyze(slice)
     return r.ok ? r : null
   }
   ```

2. No other changes in analysis-pipeline.ts. `solveAllCases` already short-circuits when `enabled === false`, so disabled Selfweight stays inert. `combineResults` already linearly sums case results, so Dead-factor combos automatically pick Selfweight up when it's enabled.

**Verify Step 3:**
- V3.1 Simple beam, single IWF200 member, L = 6 m, pin-roller, Selfweight ON, no other loads. w = 78.5 · 2848 · 1e-6 ≈ 0.2236 kN/m → each reaction Ry = wL/2 ≈ 0.6707 kN, M_mid = wL²/8 ≈ 1.006 kN·m.
- V3.2 Same model, Selfweight OFF → zero reactions (regression).
- V3.3 Manual section with γ = 0 → no synthetic loads generated; result is zero.
- V3.4 Pure Warren truss (same geometry as V2.3 canary, all members IWF, no user loads), Selfweight ON → Σ Ry equals Σ(γ · A · L) over all members; each truss member shows internal V/M from its own self-weight (parabolic with peak γAL²/8); axial forces in surrounding members reflect the cumulative dead load reaching the supports.
- V3.5 Portal frame model with a 1.4·D combo, Selfweight ON, no user dead loads. Combo result should equal 1.4 × (selfweight result), since Selfweight has `kind: "Dead"` and the combo's Dead term sums all Dead-kind cases.

### Step 4 — Stability simplification (model.ts)
1. Replace [model.ts:258-268](src/lib/model.ts#L258) with the single formula `return 3 * m + r >= 3 * j ? "STABLE" : "UNSTABLE"`.

**Verify Step 4:**
- V4.1 All built-in templates and all six truss templates report STABLE.
- V4.2 A one-node model with no support reports UNSTABLE.

### Step 5 — UI text + docs
1. [member-tool.tsx:54](src/tabs/model/tools/member-tool.tsx#L54): replace the help string for `activeMemberType === "truss"` with:
   > "Frame with moment releases at both ends. Transmits only axial force at joints, but carries transverse load locally (e.g., self-weight produces simply-supported bending between its end nodes)."

2. Update `CLAUDE.md`:
   - Solver internals section — replace the truss description with the new condensed-frame formulation. Note that canvas SFD/BMD now renders non-zero values on truss members under transverse load. Add a "Self-weight" subsection pointing at `solveCase("selfweight")` in analysis-pipeline.ts.
   - Bump status to **v1.0.4** and add a one-paragraph entry to "Refactor History" describing Selfweight Stitches.

3. Update `docs/ARCHITECTURE.md`:
   - Element library section: add a paragraph on the condensed-frame truss formulation and its rationale (matches reference software; lets self-weight flow through trusses correctly).
   - Analysis pipeline section: add a "Self-weight" subsection describing the synthetic-load synthesis pattern in `solveCase`.

4. Update `docs/USER_GUIDE.md`:
   - Truss section: explain that truss members now show non-zero shear/moment under transverse load, matching reference software behavior.
   - New "Self-weight" section: how to enable (load-case checkbox), where γ comes from (parametric auto from material class, or manual entry, or advanced override), and how it interacts with code combos via `kind: "Dead"`.

---

## Verification matrix (consolidated)

| ID | Step | Case | Expected | Validates |
|---|---|---|---|---|
| V1.1 | 1 | Try to enter I33 = 0 in manual form | Field shows red, save disabled | I=0 guard at input layer |
| V1.2 | 1 | Try to commit I33 = 0 via advanced panel override | Refused with inline error | I=0 guard at override layer |
| V2.1 | 2 | All 5 built-in templates (simple beam → asymmetric rafter), default loads | Reactions, displacements, member end forces bit-identical (≤ 1e-6) to v1.0.3 | Refactor doesn't perturb the frame path |
| V2.2 | 2 | All 6 truss templates (Warren / Pratt / Howe / X-Braced / Roof Howe / Roof Fink), default loads | Reactions and axial forces bit-identical to v1.0.3 | Condensation reduces to axial-only when no transverse load |
| V2.3 | 2 | **reference software canary**: Warren truss (3m × 3m bays), 10 kN/m global-Y on one top-chord member, span L = 3 m | **M_max at midspan = 11.25 kN·m**; M = 0 at both end nodes; parabolic BMD; matches the reference software screenshot exactly | Condensation correctness — definitive truss verification, geometry-only (independent of section properties) |
| V3.1 | 3 | IWF200 simple beam, L = 6 m, pin-roller, Selfweight ON only | Ry_left = Ry_right ≈ 0.6707 kN; M_mid ≈ 1.006 kN·m | Self-weight pipeline + global-axis distributed load math |
| V3.2 | 3 | Same model, Selfweight OFF | All zero | Regression — disabled case still zero |
| V3.3 | 3 | Manual section with γ = 0 | No synthetic loads built; zero result | Skip-on-zero short-circuit |
| V3.4 | 3 | Warren truss (V2.3 geometry), all members IWF, Selfweight ON, no user loads | Σ Ry = γ · Σ(A·L); each truss member shows parabolic M from its own weight | Self-weight + truss-with-transverse-load integration |
| V3.5 | 3 | Portal frame, 1.4·D combo, Selfweight ON, no user dead loads | Combo result = 1.4 × selfweight result | Combo wiring auto-picks Selfweight via kind=Dead |
| V4.1 | 4 | All built-in + all truss templates | STABLE | Stability simplification doesn't regress |
| V4.2 | 4 | One-node model with no support | UNSTABLE | Stability simplification doesn't lose its teeth |
| V5.1 | 5 | UI: open Member tool, switch to Truss | New help text appears | UI copy update |

---

## Risk callouts

- **R1 — Solver sign-stability (HIGH).** CLAUDE.md flags solver signs as load-bearing. The new condensation must not perturb `V1 = -f[1]`, `M1 = -f[2]` for frame members. **Mitigation:** condensation is gated behind `isTruss` only; the frame path is untouched.
- **R2 — Condensation singular when EI is zero.** Mitigated by Step 1 — sections with I33 ≤ 0 cannot exist after the input-layer guard. Templates already comply.
- **R3 — `frameConnectedNodes` removal.** Removing too eagerly will singularise pure-truss models. Plan keeps it deferred until empirical testing on the truss templates shows whether it's still needed (likely yes — condensed K has zero θ rows). Marked TODO in the code.
- **R4 — fefStore mismatch.** Element force recovery uses `f_raw − FEF`. The condensed K and condensed FEF must be paired in BOTH assembly and recovery. Single source of truth: store whatever assembly used and read that same value back in recovery.
- **R5 — Combo math on q1, q2.** Self-weight q values must propagate through combo summation so the BMD interpolation renders the right parabola on a combo view. Existing combo code at [analysis-pipeline.ts:178-180](src/lib/analysis-pipeline.ts#L178) already sums q1/q2 linearly — covered by V3.5.
- **R6 — Silent fix for legacy distributed loads on trusses.** Per user direction, no migration warning. The previous "silent ignore" was a bug; the new "correct application" replaces it.

---

## End-to-end verification protocol

1. `npm run build` — must pass with zero TypeScript errors after each step.
2. `npm run dev` — open the app, run the verification matrix above interactively.
3. **V2.3 (reference software canary)**: construct the Warren-truss model manually in the Model tab using 3 m × 3 m bay geometry; add a 10 kN/m global-Y distributed load on one top-chord truss member in the Load tab; switch to Analyze → Moment, verify the peak label reads **11.25 kN·m** and that M is zero at both end nodes. This number is geometry-only and matches the reference software screenshot exactly.
4. **V3.1**: load `template1SimpleBeam`, change its section to IWF200, enable Selfweight via the Load Case tool checkbox, switch to Analyze → Reaction, verify each Ry reads ~0.67 kN.
5. **V3.5**: any portal-frame template; ensure a 1.4·D combo exists (preset ASCE7-22 includes it); enable Selfweight; switch the Analyze view to "Combination → 1.4·D"; verify the values are 1.4× the Selfweight-only result.

After the implementation lands, update the project version to **v1.0.4** in CLAUDE.md.
