// Post-build guard: fail the build if dist/ ever contains 3D app output.
//
// `wrangler deploy` uploads all of dist/ with no filter, so dist is a second
// publication channel that .gitignore does not cover. The isolation otherwise
// rests entirely on config/vite.config.ts naming its two HTML inputs explicitly
// — one careless edit (adding src/3d/index.html as a third input) would publish
// the 3D app to the live site. This makes that edit fail loudly instead.
//
// Two checks:
//  1. dist/html contains exactly index.html and app.html.
//  2. No JS chunk contains three.js. three.js embeds literal "THREE." strings
//     in its warnings, which survive minification; chunk *names* do not help,
//     because all chunks are named app-<hash>.
import { readdirSync, readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const dist = join(root, "dist")

const EXPECTED_HTML = new Set(["index.html", "app.html"])

let failed = false

const html = readdirSync(join(dist, "html"))
for (const f of html) {
  if (!EXPECTED_HTML.has(f)) {
    console.error(`check-dist: unexpected HTML entry dist/html/${f} — the root build must only emit the landing page and the 2D app.`)
    failed = true
  }
}

for (const f of readdirSync(join(dist, "assets"))) {
  if (!f.endsWith(".js")) continue
  const src = readFileSync(join(dist, "assets", f), "utf8")
  if (src.includes("THREE.") || src.includes("@react-three")) {
    console.error(`check-dist: dist/assets/${f} contains three.js — 3D code must never enter the root build.`)
    failed = true
  }
}

if (failed) process.exit(1)
console.log("check-dist: ok — 2 HTML entries, no 3D code in any chunk.")
