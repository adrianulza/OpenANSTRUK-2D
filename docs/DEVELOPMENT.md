# OpenAnstruk Development Plan

## Version 1.0.0 — Current Status

**Release Date:** 9 May 2026

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
1. **File I/O**
   - Save/load analysis as JSON files (via browser download/upload)
   - Export member forces to CSV
   - Session persistence (localStorage; optional)

2. **Design Checks**
   - Basic RC section checks (ACI 318 flexure, shear)
   - Basic steel checks (AISC 360 bending, shear)
   - Indonesian code (SNI 2847, SNI 1729) as reference
   - Simple pass/fail indicators on members; no certification claims

3. **Load Management**
   - Define multiple load cases (DL, LL, wind, etc.)
   - Automatic load combination envelopes (ASCE 7 basic combinations)
   - Critical combination highlighting

4. **Basic Reporting**
   - Export model + diagram as PDF (via browser print or library)
   - Summary sheet (reactions, member forces, deflections)

#### Scope Limitations
- Design checks are simplified (no connection design, no optimization)
- Load envelopes follow standard rules only
- PDF export uses standard browser rendering (not publication-quality)

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
|----------|---------|--------|--------|-
| **P0** | File save/load (JSON) | Low | High |
| **P0** | Basic RC/Steel checks | Medium | High |
| **P1** | Load combinations & envelopes | Low | Medium |
| **P1** | PDF export (browser print) | Low | Medium |
| **P2** | Modal analysis | High | Medium |
| **P2** | 3D viewer prototype | High | Medium |
| **P3** | IFC import/export | Very High | Low |
| **P3** | BIM plug-ins | Very High | Medium |

---

## Technical Debt & Optimizations

### Current (v1.0.0)
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

**Questions?** Contact: openanstruk@gmail.com  
