/**
 * Build for GitHub Pages (or any sub-path host): `npm run build:pages`.
 * The base path comes from env VITE_BASE, default "/fam/". Works the same in bash and PowerShell:
 *   PowerShell:  $env:VITE_BASE = "/my-repo/"; npm run build:pages
 *   bash:        VITE_BASE=/my-repo/ npm run build:pages
 * A VITE_ADMIN_TOKEN from the environment is removed so a public build never contains one.
 */

import { spawnSync } from 'node:child_process'
import { normalizeBase } from './base.ts'

try {
  const base = normalizeBase(process.env.VITE_BASE ?? '/fam/')
  const env: NodeJS.ProcessEnv = { ...process.env, VITE_BASE: base }
  delete env.VITE_ADMIN_TOKEN
  console.log(`Building for base path ${base}`)
  const r = spawnSync('npm run build', { stdio: 'inherit', env, shell: true })
  process.exitCode = r.status ?? 1
} catch (e) {
  console.log(e instanceof Error ? e.message : String(e))
  process.exitCode = 1
}
