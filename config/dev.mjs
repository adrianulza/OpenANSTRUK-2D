#!/usr/bin/env node
// Dev launcher for `npm run dev`.
//
// Running vite directly prints a single link (http://localhost:5173/), which
// does not tell you that the app itself lives at /2d — the root path serves the
// landing page. This starts the same dev server and prints every route by name.
//
// Extra CLI args are forwarded, so `npm run dev -- --host` still works.
//
// LOCAL EXTENSION (optional). If ./dev.local.mjs exists at the repo root it is
// loaded and may export:
//
//   configFile  string   vite config to use instead of config/vite.config.ts
//   apps        array    [{ key, cwd, command, routes: [{ label, path }] }]
//   env         (urls) => object   extra env for the dev server, given a
//                                  { key: origin } map of the started apps
//
// It lets a contributor run additional dev servers alongside this one, and add
// their routes to the printed list, without modifying any tracked file. It is
// gitignored and entirely optional — nothing here depends on it existing.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultConfig = path.join(root, 'config', 'vite.config.ts')
const localModule = path.join(root, 'dev.local.mjs')

// Vite's default. The config sets no server.port, so this is where the dev
// server lands unless something already holds it.
const DEFAULT_PORT = '5173'

const bold = (s) => `\x1b[1m${s}\x1b[0m`
const dim = (s) => `\x1b[2m${s}\x1b[0m`
const cyan = (s) => `\x1b[36m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`
const yellow = (s) => `\x1b[33m${s}\x1b[0m`

/** Strip ANSI so the URL regex sees plain text. */
const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, '')

/** Startup chatter this launcher replaces with its own banner. */
const isBannerNoise = (line) =>
  /^\s*$/.test(line) ||
  /^>\s/.test(line) ||
  /VITE v[\d.]+\s+ready in/.test(line) ||
  /(Local|Network):\s+http/.test(line) ||
  /press\s+h\s*\+\s*enter/i.test(line)

const children = []
let shuttingDown = false

function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true

  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue
    // `npm run dev` spawns vite as a grandchild; on Windows only a tree kill
    // reaches it, otherwise the port stays bound after Ctrl+C.
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      child.kill('SIGTERM')
    }
  }

  setTimeout(() => process.exit(code), 300)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

/**
 * Start one dev server and resolve with the origin it actually bound to.
 * Reading the port back means a collision shifts the printed links too, rather
 * than leaving them pointing at a port nothing is listening on.
 */
function start(key, command, cwd, env) {
  return new Promise((resolve, reject) => {
    // One string, no args array: `shell: true` with separate args is deprecated
    // (DEP0190) because the args are concatenated rather than escaped.
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    })
    children.push(child)

    let resolved = false

    const relay = (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        const text = plain(line)

        if (!resolved) {
          const match = text.match(/Local:\s+(https?:\/\/\S+)/)
          if (match) {
            resolved = true
            resolve(match[1].replace(/\/$/, ''))
            continue
          }
          // Before this server is up, swallow only the chatter the banner
          // replaces — an error or a failed bind must still be visible.
          if (isBannerNoise(text)) continue
        } else if (/^\s*$/.test(text)) {
          continue
        }

        console.log(`${dim(`[${key}]`)} ${line}`)
      }
    }

    child.stdout.on('data', relay)
    child.stderr.on('data', relay)

    child.on('exit', (code) => {
      if (!resolved) {
        reject(new Error(`[${key}] exited before it was ready (code ${code ?? 0})`))
        return
      }
      if (shuttingDown) return
      console.log(yellow(`\n[${key}] dev server exited (code ${code ?? 0}) — stopping the rest.`))
      shutdown(code ?? 0)
    })
  })
}

function banner(origin, routes) {
  const pad = Math.max(...routes.map((r) => r.label.length))

  console.log('')
  console.log(bold('  OpenANSTRUK dev'))
  console.log('')
  for (const r of routes) {
    console.log(`  ${green('➜')}  ${r.label.padEnd(pad)}  ${cyan(`${origin}/${r.path}`)}`)
  }
  console.log('')

  // A stray dev server on the default port pushes this one elsewhere. Vite says
  // so in one dim line that is easy to miss, and the consequence is confusing:
  // the old server still answers the routes it knows, so the only symptom is a
  // 404 on a port that looks like the right one.
  const port = new URL(origin).port
  if (port !== DEFAULT_PORT) {
    console.log(yellow(`  ! Port ${DEFAULT_PORT} was taken, so these links use ${port} instead.`))
    console.log(yellow(`    Whatever still answers on ${DEFAULT_PORT} is a DIFFERENT server.`))
    console.log(yellow(`    Stop it and rerun to get the links above on ${DEFAULT_PORT}.`))
    console.log('')
  }

  console.log(dim('  Ctrl+C stops everything.'))
  console.log('')
}

async function main() {
  const local = existsSync(localModule) ? await import(pathToFileURL(localModule).href) : {}

  // Extra servers first: the main config may need to know the port one of them
  // actually bound to (a proxy target, say), and that is only knowable once it
  // has started.
  const urls = {}
  for (const app of local.apps ?? []) {
    urls[app.key] = new URL(await start(app.key, app.command, app.cwd)).origin
  }

  const configFile = local.configFile ?? defaultConfig
  const forwarded = process.argv.slice(2).join(' ')
  const origin = await start(
    'app',
    `npx vite -c "${configFile}"${forwarded ? ` ${forwarded}` : ''}`,
    root,
    local.env?.(urls),
  )

  banner(origin, [
    { label: 'Landing', path: '' },
    { label: '2D app', path: '2d' },
    ...(local.apps ?? []).flatMap((a) => a.routes ?? []),
  ])
}

main().catch((err) => {
  console.log(yellow(`\n${err.message}`))
  shutdown(1)
})
