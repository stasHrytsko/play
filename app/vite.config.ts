import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/**
 * One HTML entry per game, at games/<slug>/index.html — Vite's native
 * multi-page build (docs/decisions.md, 2026-09-16: shell is shared, only
 * games/<slug>/mechanic differs). Each page's output lands at
 * dist/games/<slug>/index.html, which is also the URL the hub links to.
 *
 * Rollup dedupes the shared src/shell/** import graph across every entry, so
 * a shell fix made once here is picked up by every game's dist/ on the next
 * build — no per-game copy to remember to update.
 */
function gameEntries(): Record<string, string> {
  const gamesDir = resolve(import.meta.dirname, 'games');
  const entries: Record<string, string> = {};

  for (const dirent of readdirSync(gamesDir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const indexPath = resolve(gamesDir, dirent.name, 'index.html');
    if (existsSync(indexPath)) entries[dirent.name] = indexPath;
  }

  return entries;
}

export default defineConfig({
  // Relative asset URLs: needed for Capacitor's filesystem serving in phase 2,
  // and harmless for the multi-page web build in the meantime.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    // Phaser is ~370 kB gzipped in a single chunk, shared across every game's
    // entry. Splitting it further buys little and costs a lazy-loading seam
    // in the Shell/Mechanic contract.
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      input: gameEntries(),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 4173,
  },
});
