# Visual Specification — Diagram Rendering

Reference for manually verifying canvas output after changes to `structural-canvas.tsx`.

---

## Sign Conventions (Theory-Pure)

One rule for every member regardless of orientation. **No quadrant flips, no special cases.**

### Local Axes (from i-end to j-end)
- **Local-1 (x̂)**: `(c, s) = (dx/L, dy/L)` — unit vector i→j
- **Local-2 (ŷ)**: `(-s, c)` — local-1 rotated +90° CCW. No normalization.
- **Local-3 (ẑ)**: +Z, out of screen.

### Member Internal Forces
These are the values the solver produces, which drive all diagram rendering.

| Force | Positive means | Negative means |
|---|---|---|
| N (axial) | Tension | Compression |
| V (shear) | Force on +face acts in **+local-2** direction (right-hand rule) | Opposite |
| M (moment) | Sagging — CCW about +local-3 on +face; tension on **−local-2** side | Hogging |

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

### Distributed Load (local-axis mode)
Positive `wStart`/`wEnd` acts in the **+local-2 direction**. The same `q1, q2` values flow into:
- Assembly (fixed-end force formula)
- Recovery (internal-force interpolation)

No quadrant flip — they are equal everywhere. A consequence: the physical direction of a `local-axis` load depends on the member's i→j ordering. Reversing the a/b nodes rotates +local-2 by 180° and flips the load direction.

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

- Positive shear → fills **blue** on **+local-2** side of member
- Negative shear → fills **red** on **−local-2** side
- Same rule for every member (horizontal, vertical, diagonal) — no special cases
- Sign change → diagram crosses member centerline cleanly, no gap or overlap
- Simple beam (drawn left→right) with midspan download → left half positive (blue, above), right half negative (red, below)

---

## Moment Diagram (BMD)

- Sagging / positive → fills **blue** on **−local-2** (tension-fiber) side; below centerline for a horizontal beam drawn left→right
- Hogging / negative → fills **red** on +local-2 side
- Cantilever free end → moment returns to zero at tip
- Simple beam midspan → peak positive (blue) at load point, zero at both supports
- Diagram offset is **negated** relative to SFD — sagging draws on the opposite side from +local-2

---

## Axial Diagram (AFD)

- Tension / positive → fills **blue** on +local-2 side
- Compression / negative → fills **red** on −local-2 side
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

Two independent invert flags exist in `App.tsx`: `invertSFD` and `invertBMD`. **Both default to off.** They are **pure user preferences** — they do not fix anything in the solver, they simply mirror the display to the opposite side for engineers who prefer that drawing style.

### What invert does
Flips the draw direction (to −local-2 instead of +local-2), swaps blue/red colors, and negates the label signs together — so "blue = the value the user is looking at as positive" stays consistent.

| State | Effect |
|---|---|
| `invertSFD = false` (default) | SFD draws on +local-2 side (theory-pure) |
| `invertSFD = true` | SFD mirrors to −local-2 side; colors swap; labels negate |
| `invertBMD = false` (default) | BMD draws sagging on −local-2 (tension-fiber) side |
| `invertBMD = true` | BMD mirrors to +local-2 side; colors swap; labels negate |

### Verifying invert behavior
- Toggle invert ON → diagram mirrors exactly to opposite side, colors swap (blue↔red), labels negate
- Toggle invert OFF → diagram returns to theory-pure side, original sign
- Magnitudes are unchanged in both states (invert never touches the solver)
- Applies only to SFD and BMD — AFD has no invert toggle

---

## Test Templates to Check After Changes

| Template | What to verify |
|---|---|
| template1 (simple beam) | SFD left+/right−, BMD sagging blue at midspan |
| template2 (cantilever) | BMD hogging red along full span, zero at free end |
| template3 (portal gravity) | Combined gravity + lateral loads on frame |
| template4 (portal lateral) | Vertical column diagrams — local-2 direction consistent with horizontal beam |
| template5 (asymmetric rafter) | Mixed member orientations, distributed load on inclined member, sides predictable from i→j |
