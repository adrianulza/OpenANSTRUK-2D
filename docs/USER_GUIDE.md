# User Guide

> **Work in progress.** This guide will grow as the app matures. If you'd like to help write it, see [CONTRIBUTING.md](CONTRIBUTING.md).

OpenAnstruk-2D is a browser-based 2D structural analysis tool. No installation required — open the app and start modeling.

**Launch the app:** [app.html](../html/app.html) (local) or your deployed URL.

---

## Quick Start

The workflow is linear: **Model → Load → Analyze**. Use the tabs at the top to move between steps.

1. **Model tab** — build your structure
2. **Load tab** — apply loads
3. **Analyze tab** — view results

---

## Model Tab

Build your structure using the tools in the left sidebar.

### NODE
Click anywhere on the canvas to place a node. Nodes snap to a 0.5 m grid. If you click on an existing member, the member is automatically split at that node.

### MEMBER
Click once to start a member, click again to end it. Members connect two nodes. Use the flyout panel (right side) to choose between:
- **Frame** — full beam-column with bending stiffness (default)
- **Truss** — pin-jointed, axial force only

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
- **Local axis** — load acts perpendicular to the member
- **Global axis** — load acts along global X and/or Y directions

Intensity in kN/m. Positive values follow the perpendicular CCW convention (local axis) or the positive axis direction (global axis).

### MODIFY
Click a load to select it and edit its parameters in the flyout. The delete button in the flyout removes the load.

---

## Analyze Tab

Switch to the Analyze tab to run analysis. Results update automatically whenever the model or loads change.

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
| Escape | Cancel current action / deselect |
| Arrow keys | Navigate slides in Examples modal |

---

## Verification

OpenAnstruk-2D's solver has been verified against SAP2000 on standard textbook examples. Reference files are in `_complimentary/SAP2000/`. If you find a discrepancy, please report it — see [CONTRIBUTING.md](CONTRIBUTING.md).
