// Post-build guard: fail the build if dist/ ever contains 3D app output.
//
// `wrangler deploy` uploads all of dist/ with no filter, so dist is a second
// publication channel that .gitignore does not cover. The isolation otherwise
// rests entirely on config/vite.config.ts naming its two HTML inputs explicitly
// — one careless edit (adding src/3d/index.html as a third input) would publish
// the 3D app to the live site. This makes that edit fail loudly instead.
//
// Two checks:
//  1. dist/html contains EXACTLY the expected pages — no more and no fewer.
//  2. No JS chunk contains three.js. three.js embeds literal "THREE." strings
//     in its warnings, which survive minification; chunk *names* do not help,
//     because all chunks are named app-<hash>.
//
// ⚠ Check 1 used to test one direction only: it rejected an entry it did not
// recognise and said nothing about one that had gone missing. A build that
// silently stopped emitting the app would have printed "ok". Both directions
// are asserted now, because this file exists to notice a surprise, and a page
// vanishing from a deploy is as much a surprise as a page appearing.
//
// ⚠ The landing page's decorative hero loads three.js from unpkg in an inline
// script. That is in dist/html, not dist/assets, so it is outside check 2 by
// construction — check 2 is about the 3D APP's bundle entering this build, not
// about the string "THREE." existing anywhere on the site.
import { readdirSync, readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const dist = join(root, "dist")

// Every page the root build is allowed to emit, and every page it must.
// Keep in lockstep with `build.rollupOptions.input` in config/vite.config.ts.
const EXPECTED_HTML = new Set([
  "index.html",
  "app.html",
  "donation.html",
])

// ⚠ There is deliberately NO validation.html. A public validation report is
// wanted eventually, but the validation corpus is private and includes SAP2000
// and ETABS output owned by CSI, so what it may say has to be decided before it
// is written, not after it is live. Adding the page is a content decision.
//
// ⚠ No page may ship a link that goes nowhere. A support card that looks live
// and leads to a 404 costs more trust than a card that plainly is not ready.
//
// This matches an href, not the word anywhere in the file — html/donation.html
// carries REPLACE-ME inside a comment that explains how to turn a greyed-out
// card into a real link, and those instructions must not fail the build they
// are warning about. The pending cards are <div>s with no href precisely so
// that "not ready yet" cannot become "dead link".
const DEAD_HREF = /href\s*=\s*"(\s*|REPLACE-ME)"/i

let failed = false

const html = new Set(readdirSync(join(dist, "html")))
for (const f of html) {
  if (!EXPECTED_HTML.has(f)) {
    console.error(`check-dist: unexpected HTML entry dist/html/${f} — the root build must only emit the pages named in EXPECTED_HTML.`)
    failed = true
  }
}
for (const f of EXPECTED_HTML) {
  if (!html.has(f)) {
    console.error(`check-dist: dist/html/${f} is MISSING — the build stopped emitting a page it is supposed to publish.`)
    failed = true
  }
}

// Check 3: no page ships a link that goes nowhere.
for (const f of html) {
  const src = readFileSync(join(dist, "html", f), "utf8")
  if (DEAD_HREF.test(src)) {
    console.error(`check-dist: dist/html/${f} has an empty or placeholder href — fill in the real URL, or leave the element without an href until it is ready.`)
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
console.log(`check-dist: ok — ${EXPECTED_HTML.size} HTML entries, all present, no 3D code in any chunk.`)
