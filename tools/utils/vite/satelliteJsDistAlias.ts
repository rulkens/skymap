/**
 * Vite `resolve.alias` for `satellite.js/dist/*`, shared by vite.config.ts and vitest.config.ts.
 * The package's `exports` map exposes only ".", so the subpath is refused by exports resolution;
 * an alias is applied first and points straight at the real dist directory. That directory is
 * found via the package entry (`dist/index.js`; package.json is not exported either), so a
 * worktree without its own node_modules still resolves it.
 */
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

export const satelliteJsDistAlias: Record<string, string> = {
  'satellite.js/dist': dirname(createRequire(import.meta.url).resolve('satellite.js')),
};
