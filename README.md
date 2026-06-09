# OpenAnstruk-2D

<p align="center">
  <strong>Open tool, open knowledge, open access.</strong>
</p>

<p align="center">
  <a href="https://openanstruk.org"><img alt="website" src="https://img.shields.io/badge/openanstruk.org-1a2f5e?logo=googlechrome&logoColor=white"></a>
  <a href="./LICENSE"><img alt="license MIT" src="https://img.shields.io/badge/license-MIT-green"></a>
</p>

A 2D structural analysis web application for modeling, loading, and analyzing frame structures.

> *"Whether you code, test, document, or use it — you belong here."*

## Features

- Interactive modeling: nodes, members (frame + truss), supports — snap-to-grid canvas
- Zoom (scroll-wheel + pinch) with adaptive view scaling; snap-to-node and snap-to-grid toggles
- Point loads and distributed loads (local-axis and global-axis modes)
- Direct stiffness method (DSM) solver — runs entirely in the browser
- Shear force, bending moment, axial force, and deformation diagrams
- Parametric template builder for beams, frames, and trusses
- Undo / redo (buttons + Ctrl+Z / Ctrl+Y) covering all model and load edits
- Save / load models as JSON from the File menu
- Mobile-responsive landing page; touch panning on the app canvas
- No installation — works offline after first load

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

## Documentation

| Doc | Description |
|-----|-------------|
| [User Guide](docs/USER_GUIDE.md) | How to model, load, and analyze structures in the app |
| [Architecture](docs/ARCHITECTURE.md) | Codebase structure, solver internals, and design decisions |
| [Development](docs/DEVELOPMENT.md) | Roadmap, known issues, and planned phases |
| [Contributing](docs/CONTRIBUTING.md) | How to report bugs, submit features, or get involved |

## Getting Started

```bash
npm install
npm run dev
```

- Landing page: [http://localhost:5173](http://localhost:5173)
- App: [http://localhost:5173/app.html](http://localhost:5173/app.html)

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Type-check + production build |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint |
| `npm run format` | Format with Prettier |

## Tech Stack

React 19 · TypeScript · Vite 6 · Tailwind CSS v4 · shadcn/ui · Canvas API

## Contributing

All contributions are welcome — code, bug reports, documentation, feedback. See [CONTRIBUTING.md](docs/CONTRIBUTING.md) to get started.

**Email:** team@openanstruk.org  
**GitHub Issues:** for bug reports and feature requests

## License

[MIT](LICENSE) — free to use, modify, and distribute.
