# OpenANSTRUK-2D

A 2D structural analysis web application for modeling, loading, and analyzing frame structures.

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
