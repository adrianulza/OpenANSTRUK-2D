# User Guide

> **Work in progress.** This guide will grow as the app matures. If you'd like to help write it, see [CONTRIBUTING.md](CONTRIBUTING.md).

OpenAnstruk-2D is a browser-based 2D structural analysis tool. No installation required — open the app and start modeling.

**Launch the app:** [app.html](../html/app.html) (local) or your deployed URL.

---

## Quick Start

The workflow is linear: **Model → Load → Analyze → Design**. Use the tabs at the top to move between steps.

1. **Model tab** — build your structure
2. **Load tab** — apply loads
3. **Analyze tab** — view results
4. **Design tab** — check RC beam sections (flexure + shear)

---

## Model Tab

Build your structure using the tools in the left sidebar.

### NODE
Click anywhere on the canvas to place a node. Nodes snap to a 0.5 m grid. If you click on an existing member, the member is automatically split at that node.

### MEMBER
Click once to start a member, click again to end it. Members connect two nodes. Use the flyout panel (right side) to choose between:
- **Frame** — full beam-column with bending stiffness (default)
- **Truss** — frame with moment releases at both ends. Transmits only axial force to adjoining members at the joints, but carries transverse load locally between its end nodes (a distributed load or self-weight produces a simply-supported moment diagram on the member). Matches SAP2000's truss behavior.

Duplicate members (same two endpoints) are rejected.

### SUPPORT
Click a node to assign a support. Choose the support type in the flyout:
- **Pin** — restrains horizontal and vertical displacement (free to rotate)
- **Roller** — restrains vertical displacement only (free to rotate and slide horizontally)
- **Fixed** — restrains all three DOFs (displacement and rotation)

### MATERIAL
Click a member to view and edit its section. There are two ways to define one.

**Parametric** — pick a material class (concrete or steel) and a shape, then type the dimensions. The app computes area, second moments, section moduli, radii of gyration and the torsional properties for you, and sets the unit weight from the material (concrete 24 kN/m³, steel 78.5 kN/m³). Shapes available: rectangle, circle, IWF, tee, angle, CHS and RHS. This is the mode the Design tab needs, because design checks read the shape and its dimensions, not just E, I and A.

**Manual** — enter elastic modulus (E), second moment of area (I), cross-sectional area (A), unit weight (γ) and Poisson's ratio (ν) directly. Manual sections analyse fine but cannot be designed, since there is no cross-section behind the numbers to classify or detail.

An **Advanced** panel lets you override individual derived values when you need to match a published section table.

The section list is grouped by material — **Concrete**, then **Steel**, then **Manual** — because material is what decides which design path a section can take, what dimensions it carries, and what the rest of this flyout shows.

Concrete sections also carry a **Design type** here: *Auto*, *Beam* or *Column*. It lives beside the dimensions because for concrete the design type *is* part of how the section is defined — a column takes a perimeter bar grid and ties, a beam takes top/bottom bars and stirrups. *Auto* reads each member's orientation, and promotes a member to column when its axial load reaches 0.1·f'c·Ag; an explicit choice is never overridden. (Steel has no equivalent control: nothing per-section differs, and the same IWF genuinely serves as both, so a steel member's role is inferred from its geometry.) The same field is editable in the Design tab's DESIGN SCHEDULE.

### MODIFY
Click any node, member, or support to select it and view its properties in the flyout. Multiple elements can be selected by clicking while holding Shift, or by dragging a selection box. Click a selected element again to deselect.

### DELETE
Click any node, member, or support to delete it. Deleting a node also removes connected members and supports.

---

## Load Tab

### POINT (Point Load)
Click a node to assign a point load. One load per node. In the flyout:
- **Principal mode** — enter Fx and Fy components directly (kN). Positive Fx = rightward, positive Fy = upward.
- **Angular mode** — enter magnitude (kN) and angle (degrees). 0° = rightward, 90° = upward.

### DISTRIBUTED (Distributed Load)
Click a member to assign a distributed load. One load per member. In the flyout:
- **Uniform** — same intensity along the full member length
- **Asymmetric** — different intensity at each end (trapezoidal)
- **Local axis** — load acts along the member's **+local-2** direction (local-1 = i→j unit vector, local-2 = local-1 rotated +90° CCW)
- **Global axis** — load acts along global X and/or Y directions

Intensity in kN/m. Positive values point in +local-2 (local-axis mode) or in +X / +Y (global-axis mode). The physical direction of a local-axis load depends on which end you drew first — reversing the member's start/end nodes rotates +local-2 by 180°.

### MODIFY
Click a load to select it and edit its parameters in the flyout. The delete button in the flyout removes the load.

### SELF-WEIGHT
The locked **Selfweight** load case (visible in the LOAD CASE tool) applies a body force to every member from its section's unit weight (γ, kN/m³) and cross-sectional area (A). Gravity acts in −Y.

- **Enabling**: tick the checkbox on the Selfweight row. Disabled by default.
- **Where γ comes from**: parametric sections set γ automatically (concrete 24 kN/m³, steel 78.5 kN/m³). Manual sections start with γ = 0 — set a value in the MATERIAL tool's manual form, or override it in the Advanced panel. Sections with γ = 0 contribute no self-weight.
- **Combinations**: the Selfweight case has kind = "Dead", so any code-preset Dead-factor term (1.4D, 1.2D, …) automatically includes it once enabled. You don't need to add Selfweight manually to combos.
- **Trusses**: self-weight is applied to truss members too. Each truss member shows a parabolic moment diagram from its own weight (simply-supported between its end nodes), and the reactions at supports correctly include the truss self-weight.
- **γ = 0 warning** (v1.0.6+): when Selfweight is enabled but at least one referenced section has γ = 0, an amber warning appears at the bottom of the Load Case panel — and also at the bottom of the Load Combination panel when any combination references Selfweight. Open the MATERIAL tool and set Unit Weight on the offending section to include it in self-weight.

---

## Analyze Tab

Switch to the Analyze tab to run analysis. The solver runs the moment you enter the tab and continues to update automatically while you edit on the Analyze tab. Editing in the Model or Load tabs no longer triggers a solve — re-enter Analyze to refresh results. The Analyze tab itself acts as the implicit "Analyze" trigger.

### Analysis Status

The status indicator at the bottom-left of the screen reports one of three states:

- **DETERMINATE** (green) — the model is statically determinate; reactions follow directly from equilibrium.
- **INDETERMINATE** (amber) — the model has more constraints than equilibrium alone can resolve; the stiffness method still produces a unique solution.
- **UNSTABLE** (red) — the model has a structural-validity issue that prevents analysis. Click the status pill to open the **Analysis Issues** dialog and see what went wrong.

The issues dialog auto-opens whenever you enter the Analyze tab and the model has any error-severity issue (no nodes/members/supports, fewer than 3 reaction components, a disconnected substructure, or a singular stiffness matrix from a geometric mechanism). Close it with the × button, by clicking the backdrop, or by pressing Esc. You can reopen it at any time by clicking the STATUS label.

Warnings (e.g., γ = 0 sections under Selfweight) do not block analysis but are listed in the dialog and inline in the Load tab panels.

### REACTION
Displays support reactions at each restrained node:
- **Rx** — horizontal reaction (positive = rightward)
- **Ry** — vertical reaction (positive = upward)
- **Mz** — moment reaction (positive = counter-clockwise)

Arrow direction indicates the direction the support pushes on the structure. Blue = positive, red = negative.

### SHEAR
Displays the shear force diagram (SFD) along each member. Blue regions = positive shear, red regions = negative shear. Use the scale slider to adjust diagram size.

The **Invert** toggle flips the diagram to the opposite side of the member (preference only — does not change values).

### MOMENT
Displays the bending moment diagram (BMD). The diagram is drawn on the tension fiber side. Use the shared scale slider to adjust.

### AXIAL
Displays the axial force diagram (AFD). Blue = tension, red = compression.

### DEFORMATION
Displays the deformed shape. Use the scale slider to exaggerate deformations for visibility.

---

## Design Tab

The Design tab checks two materials, and a model containing both is designed in one run. Each member goes to the strategy for its own material, so you never have to separate them yourself.

**Reinforced concrete** — rectangular beams and columns plus circular columns, per **SNI 2847:2019** or **ACI 318-25**, across Ordinary / Intermediate / Special moment frames (SRPMB / SRPMM / SRPMK under SNI). Any member with a concrete section and f'c > 0 qualifies, in any orientation.

**Structural steel** — IWF, RHS, CHS, tee and single angle, per **AISC 360-16 / SNI 1729:2020**: section classification, axial, flexure with lateral-torsional buckling, shear, and the Chapter H combined-force check.

The sidebar follows the workflow: **DESIGN SCHEDULE → REINFORCED CONCRETE → STEEL → DESIGN REPORT**.

**DESIGN SCHEDULE is setup** — one row per *section*, showing its design type (beam / column / auto), its mode, and which members carry it. **DESIGN REPORT is results** — one row per *member*, read-only, with its capacity ratio and status in the same words the canvas uses. They are separate tools because they answer different questions; when they shared one screen behind an Overview/Edit toggle, neither half was designed for its job.

The two material tools in between each work the same way: **① PREFERENCES → ② SECTION**. Preferences holds the code-level rules for that material; Section applies them to one section. The two steps are bound by a summary strip that always shows what the other step decided, and clicking it takes you there.

Each tool lists only sections that **a member actually carries**. The Design tab designs members, so a section sitting unused in the catalogue has nothing to check, and offering it could only lead to an empty pane.

- **REINFORCED CONCRETE**
  - **Preferences** — design code, framing type, bar strengths (fy, fyt, Es), strength-reduction factors (φ), lightweight factor (λ) and stirrup legs.
  - **Section** — pick **As required**, where the program computes the steel you need, or **As checked**, where you define the bars and stirrups and it reports capacity ratios. In checked mode you set cover, top/bottom/side bars, and the stirrup for two arrangements — **Support** (the 2h end/hinge zones) and **Midspan** — with a live cross-section preview and a running detailing checklist covering spacing, cover, layering, skin reinforcement and hoop spacing.
- **STEEL**
  - **Preferences** — design code, framing type, the grade (Fy, Fu, E) and the φ factors.
  - **Section** — there is no required/checked choice here, because steel has no rebar-style unknown to solve for: the check always evaluates the section you assigned. What you see instead is what AISC needs beyond the geometry — the unbraced length L<sub>b</sub>, C<sub>b</sub>, and the effective-length factors K<sub>33</sub> and K<sub>22</sub> — plus the member's inferred role, which selects the report rather than the maths. A live cross-section sits at the top; for a single angle it also draws the **principal axes**, which is worth looking at, since bending an angle about a geometric axis loads both of them at once and that is why angles come out weak.

The Section step is grouped into collapsible cards, and each card's header carries its own verdict — the detailing tally (✓ 7), the capacity ratio (D/C 0.28), the chosen arrangement (3D19 / 2D19). You read the outcome with everything closed and expand only to see the reasoning behind it.

Each tool has an **Advanced Report** you can open beside the flyout. The steel beam report draws the classic **capacity-against-unbraced-length curve**, with the plastic plateau, the ramp between L<sub>p</sub> and L<sub>r</sub>, and a marker at your member's own L<sub>b</sub> — so you can see what bracing is buying you before you change it. The steel column report draws the **AISC H1 interaction envelope** with every axial-moment pair the check looked at plotted on it.

**There is no Run button.** Opening the Design tab evaluates every member, and any edit afterwards — a bar count, a φ factor, the framing type, the model itself — re-evaluates immediately, the same way the Analyze tab already behaves inside its own tab. While a fast edit is still settling, an *Updating…* chip appears at the top of the canvas; otherwise the drawn result is current by construction.

### Reading the canvas

The default report is the **Design Summary**, and it answers in words, not numbers. Every member gets a label — including ones the program refused, because a member that renders nothing is indistinguishable from one that passed.

| Colour | Verdict | Meaning |
|---|---|---|
| navy → green → orange | `Satisfied 0.62` | every capacity equation and detailing rule met |
| red | `Overstressed (D/C 1.19)` | a capacity equation is exceeded — the section is **too small** |
| amber | `Insufficient Detailing` | capacities pass, but it cannot be built as drawn — **wrong bars**, not a wrong size |
| grey | `Not designed — …` | refused, with the reason |

Strength and detailing are separate because they fail separately and you fix them differently. When both fail, the headline is the strength one and the detailing cause is still listed underneath — making the section bigger does not make the bars fit. Causes read in the engineer's vocabulary (*Flexural*, *Shear*, *Axial-Moment*, *Confinement*), because a red member's question is *what do I resize*.

In **As required** mode a satisfied member shows `ρ 0.25` instead of a D/C. That is not a missing number: required mode sizes the steel to exactly meet demand, so a capacity ratio would read 1.00 on every adequate member. The ρ figure is how close the needed steel is to the code's maximum ratio — how much room is left.

### The report dropdown

Switching the report changes what the labels show. Concrete reports are organised by **quantity**, not by element or mode — a beam and a column both have longitudinal bars, and both design modes end in a bar area:

| Report | Shows |
|---|---|
| **Longitudinal bar** | the actual bar area, mm² — required in *As required*, provided in *As checked*; red where it is short |
| **Reinforcement ratio** | ρ per face, or ρg for a column |
| **Transverse bar** | stirrup/tie area in mm²/m, or the suggested bar@spacing |
| **Confinement** | how many tie legs the code demands vs how many the bar grid can hold |
| **Slenderness** | satisfied or not, with δns |
| **Strong-column-weak-beam** | the joint ratio, as badges at the nodes |

The last three are column-only and simply do not appear on a model without columns. Steel keeps its own list — classification, capacities, limit state, slenderness, seismic ductility — because it has neither a beam/column split nor a required/checked mode.

Reports are scoped by material: a concrete member stays unlabelled under a steel report, and vice versa. Where a model contains both, a **Concrete / Steel** switch picks which one you are reading; off-material members stay drawn in grey as context. Any run problems (no load combinations, unsolved cases, no designable section) appear in a card under the canvas.

> Design settings and results are not saved in the JSON file, same as load cases and combinations.

For the full engineering logic and the governing code clauses behind every check, see **[DESIGN_RULES.md](DESIGN_RULES.md)** (the core), **[DESIGN_RC.md](DESIGN_RC.md)** (reinforced concrete) and **[DESIGN_STEEL.md](DESIGN_STEEL.md)** (steel).

---

## Templates

Use the **NavBar file menu** to load pre-built templates or generate parametric models:

| Template | Description |
|----------|-------------|
| Simple Beam | 5 m pin–roller beam with midspan point load |
| Cantilever | Fixed-free beam with tip load |
| Portal Frame (Gravity) | Two-column frame with gravity beam load |
| Portal Frame (Lateral) | Two-column frame with lateral point load |
| Asymmetric Rafter | Sloped roof structure with mixed member orientations |

**Beam Template Modal** — generate a multi-span continuous beam with configurable span count, span length, and section.

**Frame Template Modal** — generate a multi-bay, multi-storey portal frame.

**Truss Template Modal** — generate a planar truss with configurable geometry.

---

## Saving and Loading

**Save File** writes the model to JSON — nodes, members, supports, sections and loads, including every derived section property, so it round-trips without loss. **Load File** reads one back.

> ⚠ **Load cases, load combinations and design settings are not in the file.** Only the model is.

That has a consequence worth knowing. Loads *are* saved, and each one records which load case it belongs to. Open a file in a fresh session and those cases are gone, so a load can end up pointing at a case that no longer exists — and a load belonging to no case contributes nothing to the analysis, while still being drawn on the canvas.

The app now reconciles this on load rather than letting it pass silently:

- A load with **no case at all** (a file from before load cases existed) is adopted into **Dead** and analyses immediately. There was only ever one case then, so that is what it meant.
- A load naming a **case the file did not carry** gets that case recreated, **disabled**, named `Recovered (…)`, and an alert lists them. Its original type is unknowable, and guessing is worse than not analysing — calling a Live case Dead applies 1.2 where the code wants 1.6 and hands you a plausible wrong number. Open the Load tab, set each recovered case's type, then enable it.

---

## Units

Default units: **kN, m, kN/m, MPa, mm⁴, mm²**

Grid spacing and unit system can be adjusted via the settings panel accessible from the flyout when no tool is active.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Ctrl/⌘ + Z | Undo last edit |
| Ctrl/⌘ + Y *(or Ctrl/⌘ + Shift + Z)* | Redo |
| Escape | Cancel current action / deselect |
| Arrow keys | Navigate slides in Examples modal |

### Undo / Redo

The **Undo** and **Redo** buttons sit just below the zoom slider in the top-right of the canvas, on the **Model and Load tabs** (they don't appear on the read-only Analyze tab). They cover all model and load edits — adding/deleting nodes, members, supports, sections, and any load change — keeping up to the last 20 steps. Dragging a node counts as a single undo step. History is cleared when you start a new file, load a file, or load a template/example. The keyboard shortcuts above work the same way and are likewise active only on the Model and Load tabs (they don't fire while you're typing in an input field, so text editing keeps its own undo).

---

## Verification

OpenAnstruk-2D's solver has been verified against SAP2000 on standard textbook examples. Reference files are in `_complimentary/SAP2000/`. If you find a discrepancy, please report it — see [CONTRIBUTING.md](CONTRIBUTING.md).
