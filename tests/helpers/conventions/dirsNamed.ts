/**
 * Every folder called `name` under `root`, at any depth, repo-relative. Role folders (`@types/`,
 * `utils/`, `passes/`) sit at several depths once code is grouped by concern module, so a sweep that
 * trusts one fixed path misses most of them; walking for the name sweeps a new module the day it
 * appears. A matched folder is not searched further, so `utils/` inside `utils/` is the caller's walk.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const SKIP_NAMES = new Set(['node_modules']);
const SKIP_PATHS = new Set(['tools/stars-rs/target', 'tools/vendor-types']);

export function dirsNamed(root: string, name: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const path = join(root, entry.name);
      if (SKIP_NAMES.has(entry.name) || SKIP_PATHS.has(path)) return [];
      return entry.name === name ? [path] : dirsNamed(path, name);
    });
}
