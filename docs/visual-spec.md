# Visual Specification — Diagram Rendering

Reference for manually verifying canvas output after changes to `structural-canvas.tsx`.

---

## Sign Conventions (Solver — SAP2000)

### Member Internal Forces
These are the values the solver produces, which drive all diagram rendering.

| Force | Positive means | Negative means |
|---|---|---|
| N (axial) | Tension | Compression |
| V (shear) | Force on +face in +local-y direction (left portion pushes right portion upward for horizontal member) | Opposite |
| M (moment) | Sagging (CCW on left face) | Hogging |

### Member End Force Extraction from local stiffness vector `f`
```
N1 = -f[0],  V1 = -f[1],  M1 = -f[2]    ← i-end: all negated
N2 =  f[3],  V2 =  f[4],  M2 =  f[5]    ← j-end: no negation
```

### Internal Force Interpolation along member (x = 0 at i-end)
```
V(x) = V1 − q1·x − (q2−q1)·x²/(2L)
M(x) = M1 − V1·x + q1·x²/2 + (q2−q1)·x³/(6L)
```

### Reactions (`K_orig · d − F_orig`)
Formula gives the force the support exerts **on the structure** (not reaction on support).

| Component | Positive means |
|---|---|
| Rx | Support pushes structure **rightward** |
| Ry | Support pushes structure **upward** |
| Mz | Support applies **CCW** moment to structure |

### Distributed Load Sign Flip (Critical)
When a member points **left** (`dx < 0`) or **upward** (`dy > 0`), `q1`/`q2` are negated in both:
- Assembly phase (before computing fixed-end forces)
- Recovery phase (before interpolating internal forces)

This keeps the sign used for force interpolation consistent with what went into the FEF computation.

---

---

## Colors

| Meaning | Color | Hex |
|---|---|---|
| Positive value | Blue | `#2563eb` |
| Negative value | Red | `#ef4444` |
| Load arrows/fills | Green | `#0BE77E` |

---

## Shear Diagram (SFD)

- Positive shear → fills **blue** on +perp side of member
- Negative shear → fills **red** on -perp side
- Vertical members → positive shear appears on **left** of centerline
- Sign change → diagram crosses member centerline cleanly, no gap or overlap
- Simple beam with midspan download → left half positive (blue), right half negative (red)

---

## Moment Diagram (BMD)

- Sagging / positive → fills **blue** on tension-fiber side (below centerline for horizontal beam)
- Hogging / negative → fills **red**
- Cantilever free end → moment returns to zero at tip
- Simple beam midspan → peak positive (blue) at load point, zero at both supports
- Diagram offset is **negated** relative to SFD — sagging draws opposite to +perp direction

---

## Axial Diagram (AFD)

- Tension / positive → fills **blue** on +perp side
- Compression / negative → fills **red** on -perp side
- Truss members under pure axial → uniform color along full length
- Zero axial → no fill, flat line on centerline

---

## Reaction Arrows

| Reaction | Positive | Negative |
|---|---|---|
| Ry (vertical) | Arrow below node, tip points **up** toward node, blue | Arrow above node, tip points **down**, red |
| Rx (horizontal) | Arrow left of node, tip points **right** toward node, blue | Arrow right of node, tip points **left**, red |
| Mz (moment) | **CW arc** on screen (Y-flip of CCW structural), blue, arrowhead at **top** | CCW arc on screen, red, arrowhead at **bottom** |

---

## Distributed Loads

- Arrow density uniform along member length
- Arrows perpendicular to member, pointing in load direction
- Fill color `#D7FDEB`, stroke `#0BE77E`
- Label shows `wStart` and `wEnd` values in kN/m
- Tapered load → arrow lengths vary linearly from start to end

---

## Point Loads

- Single arrow at node, direction matches angle (0°=right, 90°=up)
- Arrowhead at node tip
- Magnitude label adjacent to arrow
- Color: stroke `#0BE77E`

---

## Deformation

- Deformed shape overlaid on original (ghost)
- Displacement scaled for visibility (not true scale)
- No color coding — single line style

---

## Invert Diagram Toggles

Two independent invert flags exist in `App.tsx`: `invertSFD` (default **on**) and `invertBMD` (default **off**).

### What invert does
Flips the perpendicular draw direction and swaps blue/red colors. Effectively mirrors the diagram to the other side of the member centerline.

| State | Effect |
|---|---|
| `invertSFD = true` (default) | SFD draws on opposite side — positive shear appears below centerline for horizontal beam |
| `invertSFD = false` | SFD draws on standard +perp side |
| `invertBMD = false` (default) | BMD sagging (positive) draws on tension-fiber side (below for horizontal beam) |
| `invertBMD = true` | BMD flips — sagging draws above centerline |

### Why invertSFD defaults to true
SAP2000 convention displays positive shear on the compression side (below beam for gravity load). The invert flag achieves this without changing solver sign logic.

### Verifying invert behavior
- Toggle invert ON → diagram should mirror exactly to opposite side, colors swap (blue↔red)
- Toggle invert OFF → diagram returns to standard side
- Numeric labels should also negate when invert is on (sign flipped in label output)
- Applies only to SFD and BMD — AFD has no invert toggle

---

## Test Templates to Check After Changes

| Template | What to verify |
|---|---|
| template1 (simple beam) | SFD left+/right−, BMD sagging blue at midspan |
| template2 (cantilever) | BMD hogging red along full span, zero at free end |
| template3 (portal gravity) | Combined vertical + perpendicular loads on frame |
| template4 (portal lateral) | Vertical column diagrams, perpendicular direction correct |
| template5 (asymmetric rafter) | Mixed member orientations, distributed load on inclined member |
