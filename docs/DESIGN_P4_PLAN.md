# Design Engine — Feature Plan (P4): Steel + RC Geometry Expansion

Status after the **v1.1.2 restructure (P0–P3, done)**: the design engine is split
into a material-agnostic `core/` and per-material strategies (`rc/` implemented,
`steel/` stubbed). The orchestrator dispatches each member to its material's
strategy by `section.materialClass`. RC math is byte-stable (all `validation/`
anchors pass). This document plans the remaining feature work (P4) — **not yet
implemented**.

The seams already in place that P4 builds on:

- `core/designability.ts → DESIGN_SUPPORT` — the target (material × geometry ×
  element) matrix. Each row has an `implemented` flag; today only
  `{rc, rect, beam+column}` is `true`. **Enabling a combination = flip the flag +
  add its strategy branch.** `isSectionDesignable()` already gates on `implemented`,
  so planned-but-unbuilt geometries show as "N.A." in the section picker without
  crashing.
- `core/section-input.ts` — `SectionDesignInput` is a discriminated union
  (`RcSectionInput | SteelSectionInput`); `defaultSectionDesignInput(id, section)`
  picks by material. Steel input already carries stub fields (`Lb`, `Cb`).
- `core/types.ts → MemberDesignResult` — carries an optional `material` tag and a
  shared `{ status, kind, worstFlexureDC }` base used by the canvas colouring and
  report dropdown. Steel adds its own optional payload field (see §1.4).
- `steel/strategy.ts → designMemberSteel()` — the dispatch target; currently
  returns `status: "not-implemented"`.

Each engineering formula must cite its code clause and gain a `validation/`
assertion where it anchors a known example (same discipline as the RC engine).

---

## 1. Steel design (AISC 360-16 / SNI 1729:2020)

Target geometry (from `DESIGN_SUPPORT`): **IWF, angle (L), CHS, RHS** — beam +
column. The section catalogue already computes and caches everything the steel
checks need in `section.derived` (`Z33`, `Z22`, `S33b/t`, `r33`, `r22`, `J`, `G`)
plus `strength.fy`/`fu` — no new section math required.

### 1.1 Classification (B4) — first gate
Per-shape width-to-thickness checks for flange + web → **compact / noncompact /
slender**, in both flexure and compression. Drives which flexure/compression
equations apply. New module `steel/classify.ts` with a per-shape strategy keyed
off `section.shape.kind` + `dims` (`b, h, tf, tw, d`).

### 1.2 Flexure (Chapter F) — beams
- **F2** doubly-symmetric compact I-shapes & channels about the strong axis:
  - Yielding: `Mp = Fy·Z`.
  - Lateral-torsional buckling: `Lp`, `Lr`, `Cb`-modified `Mn` across the three
    LTB zones (`Lb ≤ Lp` plateau; inelastic linear; elastic `Fcr`). Inputs `Lb`,
    `Cb` already on `SteelSectionInput`.
- **F3** noncompact/slender flange; **F6** angles; **F7** RHS/box; **F8** round
  HSS (CHS). One sub-strategy per shape class.
- `φb = criteria.steel.phiB` (0.90). D/C = `Mu / φMn`, enveloped per zone like RC.

### 1.3 Compression (Chapter E) + combined (Chapter H) — columns
- **E3** flexural buckling: `Fe = π²E/(KL/r)²`, `Fcr` (inelastic vs elastic),
  `Pn = Fcr·Ag`; **E7** slender-element reduction. Effective length `KL` from
  member length (K input deferred; default 1.0).
- **H1.1** P-M interaction (beam-column): the two-branch `Pr/Pc` envelope, using
  the paired `(P, M)` stations already produced by `collectPMPairs` (reused from
  RC columns). D/C is the H1 utilization, not a radial polygon ratio.

### 1.4 Shear (Chapter G)
- **G2** web shear `Vn = 0.6·Fy·Aw·Cv`; CHS via **G5**. `φv = phiV` (0.90).

### 1.5 Result shape
Add `steel?: SteelMemberResult` to `MemberDesignResult` (sibling of `column?`),
holding classification, `φMn`/`φPn`/`φVn`, the governing `Lb`-zone, and the H1
utilization. `worstFlexureDC` = governing utilization so the existing canvas
colour ramp + legend work unchanged. Add steel entries to `DESIGN_REPORTS`
(e.g. "Flexure D/C", "Compression D/C", "Interaction H1").

### 1.6 UI (`tabs/design/tools/steel/`)
Flesh out `steel-design-tool.tsx`: element-type select, `Lb`/`Cb` inputs,
read-only classification + capacity readout, and a steel section preview
(reuse the catalogue's shape renderer). Criteria tool already has the steel
block (`Fy`, `Fu`, `E`, `φb`, `φv`, `φc`) — wire the fields in (currently the
RC-only `RcCriteriaFields`; add a parallel `SteelCriteriaFields`).

### 1.7 Validation
`validation/steel_*_verify.mts` anchored to AISC Design Examples / SNI 1729
worked problems: F2 LTB (all three zones), E3 column, H1 beam-column, G2 shear —
one shape per check minimum (W-shape first, then angle/CHS/RHS).

---

## 2. RC geometry expansion

Currently RC is **rectangular only**. The target matrix already lists:

| Geometry | Beam | Column | Notes |
|----------|------|--------|-------|
| rect     | ✅   | ✅     | implemented |
| circle   | —    | ✅     | **column only** (spiral/tied round column) |
| tee      | ✅   | —      | **beam only** (flanged section, T-beam) |

### 2.1 Circular column
- Interaction by integrating the circular concrete stress block + a polar bar
  ring. `column.ts` is currently rectangular (`b·a` Whitney block, Cartesian bar
  depths) — add a `circle` branch to `sectionForcesAtC` / `buildInteractionCurve`
  that uses the circular segment area + centroid as a function of `c`, with bars
  on a bolt-circle. Spiral option → `φ` and `Pn,max` factors per 21.2.2 / 22.4.2.
- `column-layout.ts`: bars equi-spaced on a circle (count + cover) instead of the
  nx×ny grid. New `RcSectionInput` circular column sub-shape (or reuse `column`
  with a `pattern: "rect" | "circle"` discriminant).
- Preview: `rc-column-preview.tsx` gains a circular section render.

### 2.2 T-beam
- Flexure: effective flange width (`6.3.2`), then the strain-compat solver
  (`phiMnBars`) already handles an arbitrary compression-block **shape** if the
  block-area/centroid function accounts for the flange step (compression in flange
  vs. web when `a` crosses `hf`). Extend the displaced-concrete + `Cc` terms in
  `flexure.ts` to a piecewise flange/web width; bar layout reuses `bar-layout.ts`
  with the web width for stirrups and spacing.
- `isSectionDesignable` / `DESIGN_SUPPORT`: flip `{rc, tee, beam}` and add the
  flange dims (`bf`, `hf`) read from `section.shape.dims`.

### 2.3 Designability wiring
For each enabled combination: set `implemented: true` in `DESIGN_SUPPORT`, ensure
`hasValidGeometry()` checks the shape's required dims, and branch the RC strategy
on `section.shape.kind`. The element-type guard already blocks the unsupported
direction (circle→beam, tee→column) at the matrix level — surface a clear N.A.
reason in the tool.

### 2.4 Validation
`validation/rc_circle_column_verify.mts` (round-column interaction vs a textbook
P–M chart) and `validation/rc_tbeam_verify.mts` (flanged `φMn`, flange-vs-web
neutral axis both cases).

---

## 3. Sequencing & invariants

1. **RC T-beam** — smallest reach (reuses strain-compat + bar layout), unlocks the
   most common non-rect concrete case.
2. **RC circular column** — new interaction geometry; isolated to `column*.ts`.
3. **Steel beams (F2 + G2)** — new material; the classification + LTB spine.
4. **Steel columns (E3 + H1)** — reuses `collectPMPairs`.
5. **Remaining steel shapes** (angle/CHS/RHS) + slender elements.

Invariants to preserve at every step:

- **RC byte-stability**: `rc/flexure.ts`, `rc/shear.ts`, end-force extraction stay
  untouched; new geometry adds branches, never edits the rect path. Re-run all
  `validation/rc_*` after each change.
- **Orchestrator stays material-agnostic** — no shape/material `if`s leak into
  `core/run-design.ts`; they live in the strategy.
- **Every formula cites its clause + gains a `validation/` assertion** at the
  point it anchors a known example.
- Design state remains App-state only (not in `StructureModel`, not persisted by
  Save/Load) until that limitation is lifted separately.
