# Contributing to OpenAnstruk

Thank you for your interest in contributing. OpenAnstruk is built on the belief that structural engineering software should be open, auditable, and accessible to everyone — and that belief only holds if people like you help make it real.

This document covers how to get involved, regardless of your background.

---

## Ways to Contribute

You don't need to be a developer to contribute meaningfully.

### Use It and Report Back
Run the app on real problems. Compare results against textbook examples or other tools. Report anything that looks wrong — unexpected diagram shapes, incorrect reactions, odd behavior on specific geometries. These reports are valuable.

**→ Email: openanstruk@gmail.com**

### Report Bugs
Found something broken? Open an issue on GitHub. A good bug report includes:
- What you were doing
- What you expected to happen
- What actually happened
- A screenshot or template that reproduces it

**→ GitHub Issues: [github.com/adrianulza/OpenAnstruk-2D/issues](https://github.com/adrianulza/OpenAnstruk-2D/issues)**


Read [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) before touching the solver — sign conventions are critical and easy to break.


### Write Documentation
User guides, worked examples, tutorial videos. If you're a structural engineer who understands the software, explaining it to others is enormously valuable.

### Translate
Make the app accessible in other languages. Currently English only.


### Prerequisites
- Node.js 18+
- npm

### Getting Started

```bash
git clone https://github.com/adrianulza/OpenAnstruk-2D.git
cd OpenAnstruk-2D
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) for the landing page, or [http://localhost:5173/app.html](http://localhost:5173/app.html) for the app directly.

### Other Commands

```bash
npm run build        # Type-check + production build
npm run lint         # ESLint
npm run format       # Prettier (auto-fix)
npm run format:check # Prettier (check only)
```

### Tech Stack

React 19 · TypeScript · Vite 6 · Tailwind CSS v4 · shadcn/ui · Canvas API

No backend. No database. Everything runs in the browser.

---

## Pull Request Review Policy

We truly appreciate every contribution to OpenANSTRUK-2D — your time and effort in improving this project means a lot. To ensure the application remains trustworthy for engineering use, we ask for your patience and understanding with the following review process.

**All pull requests are reviewed and merged solely by the project maintainer.**

OpenAnstruk maintains strict standards for both UI consistency and solver accuracy. Every contribution — whether a new feature, bug fix, or enhancement — is evaluated against the existing design language and verified for structural correctness before acceptance. This ensures the application remains reliable for engineering use.

Please do not expect immediate merges. The maintainer will review your PR, may request changes, and will merge only when satisfied that the contribution meets the project's quality bar. Thank you for your understanding — every accepted contribution is genuinely valued.

---

## Pull Request Guidelines

1. **Read the architecture doc first.** [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) explains how the pieces fit together. Solver changes especially require understanding the sign conventions.

2. **Keep changes focused.** One concern per PR. A bug fix and a refactor in the same PR are hard to review.

3. **Test manually with the templates.** Load template1 (simple beam), template3 (portal gravity), template4 (portal lateral), and template5 (asymmetric rafter) to verify nothing regressed. There is no automated test suite yet.

4. **Don't add comments that describe what the code does.** Well-named identifiers handle that. Only add a comment when the *why* is non-obvious: a constraint, a sign convention workaround, a subtle invariant.

5. **Don't change constants.ts colors or sizes without reason.** Those values are calibrated to look correct at common screen sizes.

6. **Solver changes require sign-convention verification.** After any solver edit, verify all four diagram types (SFD, BMD, AFD, reactions) on both horizontal and vertical members with both load types.

---

## Code Style

- TypeScript strict mode. No `any`.
- Prettier config is in `package.json` (semi: false, singleQuote: true, printWidth: 100).
- Run `npm run format` before committing.
- Path alias `@/*` maps to `src/`.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](../LICENSE).

---

## Contact

- **Email:** openanstruk@gmail.com
- **GitHub:** [github.com/adrianulza/OpenAnstruk-2D](https://github.com/adrianulza/OpenAnstruk-2D)
