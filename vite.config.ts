import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { normalizeBase } from './scripts/base.ts'

// https://vite.dev/config/
// VITE_BASE sets the sub-path for hosting such as GitHub Pages ("/fam/"); default is the site root.
export default defineConfig({
  base: normalizeBase(process.env.VITE_BASE),
  plugins: [react()],
})
