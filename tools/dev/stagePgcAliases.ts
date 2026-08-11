#!/usr/bin/env node
/**
 * stagePgcAliases — copy the committed `data/pgc_aliases.json` source into the
 * gitignored `public/data/` serving dir for the dev server.
 *
 * ## Why this exists
 *
 * `pgc_aliases.json` is the PGC -> human-name map that powers the Cmd+K
 * palette's alias search.  It's an *expensive, externally-sourced* artefact (a
 * slow chunked HyperLEDA pull — see `tools/fetch/buildPgcAliases.ts`), so
 * unlike the deterministic `.bin` outputs it's committed to git as a source
 * file under the `data/` root (the curated seeds live in `data/seeds/`).
 *
 * Production ships it hashed out of `public/data/` like every other tracked
 * file (`buildDataManifest` + `collectDataFiles`) — there is no separate
 * EXTRA_FILES row for it anymore.  But the dev server has no R2:
 * `VITE_DATA_BASE_URL` is empty, so the browser fetches the relative
 * `/data/pgc_aliases.json`, which Vite serves from `public/`.  This script
 * bridges that gap by staging the committed source into `public/data/`.
 *
 * Wired into `npm run predev` so a fresh clone (or worktree) has it the first
 * time the dev server starts.  Idempotent and non-fatal: a missing source only
 * warns (alias search degrades to famous-only — the palette handles an absent
 * map), so it never blocks `npm run dev`.
 */
import { copyFileSync, existsSync, lstatSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SRC = resolve('data/pgc_aliases.json');
const DEST = resolve('public/data/pgc_aliases.json');

function main(): void {
  if (!existsSync(SRC)) {
    process.stderr.write(
      `stage-pgc-aliases: ${SRC} not found — skipping (Cmd+K alias search will be unavailable).\n` +
        `  Run \`npm run build-pgc-aliases\` to regenerate it, or pull it from R2.\n`,
    );
    return;
  }
  // A /link-data'd worktree has public/data as a symlink into the main
  // checkout — copying through it stages a logical-named file into main's
  // real tree, which then trips collectDataFiles's drift guard on main's
  // next sync-r2 (see buildDataManifest's matching early-out).
  if (existsSync(dirname(DEST)) && lstatSync(dirname(DEST)).isSymbolicLink()) {
    process.stderr.write(
      `stage-pgc-aliases: public/data is a symlink — skipping (this checkout doesn't own that tree).\n`,
    );
    return;
  }
  mkdirSync(dirname(DEST), { recursive: true });
  copyFileSync(SRC, DEST);
  process.stdout.write(`stage-pgc-aliases: ${SRC} -> ${DEST}\n`);
}

main();
