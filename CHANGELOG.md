# Changelog

All notable changes to OpenAnstruk-2D are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.0.1] — 2026-05-14

**Mobile & Canvas UX**

### Added
- **Zoom** — scroll-wheel zoom on desktop; pinch-to-zoom on mobile (0.1× – 3× range)
- **Adaptive View** — line widths, node sizes, and arrowheads scale with zoom level so the structure stays readable at any zoom
- **Snap to Node** toggle — independently snap cursor to nearby existing nodes
- **Snap to Grid** toggle — grid snapping is now user-controllable, not always-on
- **Show Dimensions** toggle — live member-length label displayed while drawing
- All four canvas toggles surfaced in the Settings popover (status bar)
- Mobile-responsive landing page — hero, feature grid, and nav adapt to small screens
- Touch panning on the app canvas (one-finger drag on mobile)
- Mobile warning modal on the app shell for unsupported screen sizes
- Cloudflare Pages deployment config (`wrangler.toml`, `.npmrc`)
- GitHub PR template and CODEOWNERS file

### Fixed
- Flyout panel now scrollable and touch-friendly on mobile
- Template modals (beam, frame, truss, examples) sized correctly on small screens
- Nav bar and tool sidebar layout adjusted for narrow viewports
- Status bar condensed for mobile
- SPA root redirect fixed (`/` → `/html/index.html`) for Cloudflare and Netlify

### Changed
- App URL updated to `openanstruk.org`
- Contact email updated to `team@openanstruk.org`
- Axis gizmo and load arrows scale correctly with adaptive view zoom

---

## [1.0.0] — 2026-05-09

**Initial public release.**

- Interactive canvas — nodes, members (frame + truss), supports, snap-to-grid
- Point loads and distributed loads (local-axis and global-axis modes)
- Direct stiffness method (DSM) solver — runs entirely in the browser
- Shear force, bending moment, axial force, and deformation diagrams
- Invertible SFD/BMD; diagram scale and deformation scale sliders
- Parametric template builder for beams, frames, and trusses
- Five pre-built example models with SVG previews
- Unit system settings (kN/m default)
- MIT licensed, open source
