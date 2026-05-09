# OpenAnstruk-2D

<p align="center">
  <strong>Open tool, open knowledge, open access.</strong>
</p>

<p align="center">
  <a href="https://openanstruk.com"><img alt="website" src="https://img.shields.io/badge/openanstruk.com-1a2f5e?logo=googlechrome&logoColor=white"></a>
  <a href="./LICENSE"><img alt="license MIT" src="https://img.shields.io/badge/license-MIT-green"></a>
</p>

A free, open-source 2D structural analysis application that runs entirely in your browser. Model portal frames, beams, and trusses — apply loads, solve, and view results.

> *"Whether you code, test, document, or use it — you belong here."*

## Features

- Interactive modeling: nodes, members (frame + truss), supports — snap-to-grid canvas
- Point loads and distributed loads (local-axis and global-axis modes)
- Direct stiffness method (DSM) solver — runs entirely in the browser
- Shear force, bending moment, axial force, and deformation diagrams
- Parametric template builder for beams, frames, and trusses
- No installation — works offline after first load

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

**Email:** openanstruk@gmail.com  
**GitHub Issues:** for bug reports and feature requests

## License

[MIT](LICENSE) — free to use, modify, and distribute.
