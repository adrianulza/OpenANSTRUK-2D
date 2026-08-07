# OpenAnstruk Development Plan

## Version 1.0.1 — Current Status

**Release Date:** 14 May 2026  
**Previous:** v1.0.0 (9 May 2026) — see [CHANGELOG.md](../CHANGELOG.md)

### What We've Shipped

OpenAnstruk-2D is a **web-based 2D structural analysis tool** for students, educators, and early-stage engineers. It provides interactive modeling and real-time analysis without installation or licensing barriers.

#### Core Features
- **Interactive Modeling** — Place nodes, members, and supports with snap-to-grid
- **Real-time Analysis** — Shear force, bending moment, and axial force diagrams updated as you model
- **Web-Based** — Offline-capable; no installation required
- **Open Source** — MIT licensed; all solver code is transparent and auditable
- **Templates** — Five pre-built examples (beam, cantilever, portal frame, truss, rafter)
- **Load Types** — Point loads and distributed loads (local and global axis modes)
- **Member Types** — Frame (full moment transfer) and truss (pin-jointed)
- **Reactions & Diagrams** — Full reaction display; invertible SFD/BMD; deformation visualization
- **Zoom & Adaptive View** — Scroll-wheel/pinch zoom (0.1× – 3×); line widths and markers scale with zoom
- **Snap Toggles** — Snap-to-grid and snap-to-node independently configurable; live dimension label while drawing
- **Mobile Support** — Responsive landing page; touch panning on canvas; mobile-friendly modals and flyout

#### Known Scope
- 2D linear elastic analysis (frames and trusses)
- No design code checks
- No file save/load system
- No load combinations or envelopes
- Session-based (work lost on page refresh)

---

## Roadmap — Phase 2 → Phase 4

### Phase 2 — Design & File Management

**Goal:** Make analysis results usable and persistent.

#### Features

1. **More Shapes** (T-section, L-angle, C-channel, Pipe) (DONE)
   - New shape calculators in parametric section system  (DONE)
   - Each shape: dimension inputs, SVG preview, full property computation  (DONE)
   - Concrete gains T-section; Steel gains L-angle and C-channel (DONE)

2. **Load Cases & Combinations**
   - Define named load cases (DL (SWDL and SIDL), LL, Wind, Seismic, etc.)
   - Automatic load combination envelopes (ASCE 7-16 / SNI basic combinations)
   - Critical combination highlighting in Analyze tab
   - Required before self-weight and design checks

3. **Self-Weight**
   - Auto-generate gravity loads from section unit weight, SW (γ, kN/m³)
   - Self-weight distributed into a Dead Load case at solve time
   - Project-level toggle (Include self-weight: on/off)
   - Depends on load cases being available

4. **Design Checks** (RC and Steel) (DONE)
   - RC: ACI 318-25 / SNI 2847:2019 — beams (flexure, shear, detailing) and columns
     (P–M interaction, capacity-design shear, confinement, strong-column-weak-beam,
     slenderness), rectangular and circular
   - Steel: AISC 360-16 / SNI 1729:2020 — classification, axial (E3/E4/E7/D2),
     flexure (F2/F3/F7/F8/F9/F10) with LTB, shear (G2–G5), Chapter H interaction;
     IWF, RHS, CHS, tee and single angle
   - Capacity ratios on members, per-material report overlays, Advanced Report decks
   - New Design tab (4th tab after Analyze)
   - Remaining: AISC F4/F5 noncompact and slender webs (refused, not approximated),
     double angle, tension rupture D2-2, sway-frame K, second-order amplification,
     AISC 341-16 seismic detailing. Torsion and out-of-plane bending are permanent
     limits of a 2D model rather than deferrals.

5. **File I/O**
   - Save/load structure as JSON (browser download/upload)
   - Export member forces to CSV
   - Session persistence via localStorage (optional)
   - Schema versioning to support future migration

6. **Timoshenko Beam Mode**
   - Shear deformation correction factor φ = 12EI/(GAκ·L²)
   - Modifies local stiffness matrix; no change to load assembly or diagrams
   - Project-level toggle (Beam theory: Euler-Bernoulli / Timoshenko)
   - Manual sections without Aκ2 fall back to Euler-Bernoulli

7. **Basic Reporting**
   - Export model + diagrams as PDF (browser print)
   - Summary sheet: reactions, member forces, deflections, D/C ratios
   - Available after design checks are complete

#### Scope Limitations
- Design checks: simplified code checks only (no connection design, no optimization)
- Load envelopes: standard ASCE 7 / SNI combinations only (no user-defined combinations)
- Timoshenko: 2D in-plane shear deformation only (no out-of-plane or torsion)
- PDF export: browser print rendering (not publication-quality)
- File I/O: JSON format only (no IFC, no DXF)

---

### Phase 3 — 3D & Dynamics

**Goal:** Extend to 3D linear analysis and basic dynamic response.

#### Features
1. **3D Modeling**
   - 3D node/member interface (canvas or basic WebGL)
   - Space frame analysis (3D DSM solver)
   - Parametric 3D templates (simple building, tower, truss)

2. **Dynamic Analysis**
   - Modal analysis (eigenvalue problem for natural frequencies)
   - Response spectrum analysis (ASCE 7 earthquake response)
   - Basic seismic design outputs

3. **3D Visualization**
   - 3D member diagram rendering (SFD/BMD on 3D members)
   - Mode shape animation
   - Interactive 3D viewer (WebGL/Three.js)

#### Scope Limitations
- No soil-structure interaction
- No damping modeling (undamped modal analysis)
- No time-history analysis
- Limited to small-to-medium structures (< 1000 DOFs)

---

### Phase 4 — BIM & Detailing

**Goal:** Bridge to professional CAD/BIM workflows.

#### Features
1. **BIM Interoperability**
   - IFC import (read basic geometry)
   - IFC export (structure + analysis results)
   - Link to Revit via plug-in (read model, write reactions)

2. **Automated Detailing**
   - Generate standard drawing templates (sections, elevations)
   - Bill of materials (member list, quantities)
   - Basic reinforcement detailing for RC sections

#### Scope Limitations
- Limited to simple IFC structures (no complex connections)
- Detailing is template-based (not generative AI)
- Revit integration read-only initially

---

## Next Steps (Phase 2 Priority)

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| **P0** | More shapes (T, L, C, Pipe) | Low | Medium |
| **P0** | Load cases & combinations | Medium-High | High |
| **P1** | Self-weight | Low | High |
| **P1** | Design checks RC/Steel | High | High |
| **P2** | File save/load (JSON) | Medium | High |
| **P2** | Timoshenko beam mode | Medium | Low |
| **P3** | PDF / Report export | Medium | Medium |
| **P3** | Modal analysis | High | Medium |
| **P4** | 3D viewer prototype | High | Medium |

---

## Technical Debt & Optimizations

### Current (v1.0.1)
- [ ] Add undo/redo system (currently no history)
- [ ] Memoize solver results (recomputed every render)
- [ ] Code-split bundle (if performance issues emerge)
- [ ] Add unit tests (currently manual testing only)
- [ ] Improve error messages (solver failures are cryptic)

### Near Future
- [ ] Refactor solver into separate module (easier to test and extend)
- [ ] Add performance profiling (Canvas rendering bottleneck at 100+ members)
- [ ] Implement caching strategy for diagrams
- [ ] Move constants to configuration file (currently hardcoded)

---

## Known Issues & Technical Work

### Before Phase 2
- [ ] Add undo/redo (currently no history)
- [ ] Performance: Canvas rendering slow for structures > 100 members
- [ ] Error handling: Solver failures are cryptic; improve messages
- [ ] Add automated tests (currently manual testing only)

### Before Phase 3
- [ ] Refactor solver into testable module
- [ ] Profile and optimize renderer (potential GPU acceleration)
- [ ] Support larger problems (currently < 50 members typical)

---

## Design Philosophy

1. **Practical first** — Deliver usable tools before exotic features
2. **Inclusive Apps** Let engineers, students, and small firms analyze structures without licensing costs or corporate dependency
3. **Open internals** — All solver code stays readable and auditable
4. **Incremental** — Release small features early and often

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Reporting bugs
- Submitting features
- Code style and review process

## License

MIT License — all code and contributions are open for use, modification, and distribution.

---

**Questions?** Contact: team@openanstruk.org  
