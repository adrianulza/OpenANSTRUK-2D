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
Click a member to view and edit its section properties: elastic modulus (E), second moment of area (I), cross-sectional area (A), unit weight (W), and Poisson's ratio (ν).

Available sections: IWF 150, IWF 200, WF 300.

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

The Design tab checks **reinforced-concrete rectangular beams** for flexure and shear per **ACI 318-14 / SNI 2847:2019**, across Ordinary / Intermediate / Special moment frames (OMF / IMF / SMF). It applies to any member with a concrete rectangular section (f'c > 0), in any orientation.

Two tools set it up:

- **DESIGN CRITERIA** — the global code setup: framing type, steel strengths (fy, fyt, Es), strength-reduction factors (φ), lightweight factor (λ), and stirrup legs.
- **SECTION DESIGN** — per concrete section: pick **As required** (the program computes the steel needed) or **As checked** (you define the bars and stirrups, and it reports capacity ratios). In checked mode you set cover, top/bottom/side bars, and the stirrup for two arrangements — **Support** (the 2h end/hinge zones) and **Midspan** — with a live cross-section preview and a running ACI detailing checklist (spacing, cover, layering, skin reinforcement, hoop spacing).

Press **Run Design** (floating button, top of the canvas) to evaluate every beam. Members are coloured by their worst flexural capacity ratio (navy → green → orange → red), with a flexure and a shear label per member and a colour legend. Any run problems (no load combinations, unsolved cases, no designable section) appear in an amber card.

> Design results are not saved in the JSON file (same as load cases and combinations) and clear automatically whenever you change the model, loads, combinations, or design inputs — re-run after edits.

For the full engineering logic and the governing code clauses behind every check, see **[DESIGN_RULES.md](DESIGN_RULES.md)**.

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
