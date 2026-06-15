#!/usr/bin/env node
/**
 * copyHiResToPublic — flatten the curator's per-galaxy directory tree
 * into a sweep-friendly directory that `tools/deploy/syncR2.ts` can
 * upload verbatim.
 *
 * ── Why this build step exists ────────────────────────────────────────
 *
 * The famous-galaxy curator (`tools/famous-curator/`) writes a rich,
 * per-galaxy directory containing the source image, the starless
 * variant, the 128 px atlas slot, the 1024 px hi-res render, and a
 * recipe.json that records the parameters used:
 *
 *   public/images/famous-curated/<id>/
 *     ├── full.webp        ← 1024 px hi-res render (THIS step ships it)
 *     ├── atlas.webp       ← 128 px atlas slot (fetchFamousImages owns)
 *     ├── source.webp      ← raw input to the recipe
 *     ├── starless.webp    ← intermediate
 *     └── recipe.json
 *
 * That layout is great for the curator UI and for human inspection, but
 * the runtime only needs the 1024 px renders, served from a single flat
 * directory so `syncR2`'s glob is one line:
 *
 *   public/data/images/famous-hires/
 *     ├── m31.webp
 *     ├── ngc1300.webp
 *     └── …
 *
 * The destination is under `public/data/` (not bare `public/`) because
 * the runtime's `dataUrl()` helper always prefixes `/data/` — so
 * `dataUrl('images/famous-hires/m31.webp')` resolves to
 * `<base>/data/images/famous-hires/m31.webp`, and the dev server (and
 * R2 in prod) serves that path from `public/data/images/famous-hires/`.
 *
 * ── When this runs ────────────────────────────────────────────────────
 *
 * The curator's Commit already publishes the hi-res for the ONE galaxy it
 * just exported (via `publishFamousRuntimeImages`), so the day-to-day loop
 * never needs this.  This bulk step is the fresh-clone / mass-regeneration
 * path: `public/data/images/famous-hires/` is gitignored, so a clean
 * checkout rebuilds it from the committed `famous-curated/<id>/full.webp`
 * masters with `npm run build-famous-hires`.  It is NOT chained into
 * `build-all` / `build-tiers` — it's a standalone command.
 *
 * ── Idempotency ───────────────────────────────────────────────────────
 *
 * The per-file skip/copy/stamp logic lives in `copyIfChanged`
 * (publishFamousRuntimeImages.ts) — shared with the curator's Commit so
 * both paths treat "already in sync" identically.  Skip rule: dest exists
 * AND (source.mtime-to-the-second, source.size) match.  When we DO copy we
 * stamp the dest's mtime to the source's so the next run finds the match.
 * mtime+size (not a checksum) because curator re-renders REWRITE full.webp
 * with a fresh mtime even when bytes are identical, and avoiding per-file
 * SHA keeps the sweep under 100 ms for ~75 entries.
 *
 * ── Missing entries ───────────────────────────────────────────────────
 *
 * Not every famous-galaxy seed has been curated yet.  Iterating the
 * curator output is correct (we only ship what exists), but the caller
 * benefits from knowing which IDs are partial — recipe.json present,
 * full.webp absent — so it can log graceful coverage and the operator
 * can decide whether to push the curator further.  Those IDs come back
 * in the `missing[]` field of the return; we never throw on them.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyIfChanged, CURATED_DIR, HIRES_RUNTIME_DIR } from './publishFamousRuntimeImages';

type CopyHiResOptions = {
  /** Source root.  Defaults to the curated master dir relative to CWD. */
  sourceDir?: string;
  /** Destination root.  Defaults to the hi-res runtime dir relative to CWD. */
  destDir?: string;
};

type CopyHiResResult = {
  /** Number of files newly written (or refreshed because source changed). */
  copied: number;
  /** Number of files skipped because the dest was already in sync. */
  skipped: number;
  /** IDs whose curator dir exists but has no `full.webp` yet. */
  missing: string[];
};

const DEFAULT_SOURCE = CURATED_DIR;
const DEFAULT_DEST = HIRES_RUNTIME_DIR;

/**
 * Iterate every direct subdirectory of `sourceDir`, copy each
 * `<id>/full.webp` to `<destDir>/<id>.webp`, and return a summary.
 *
 * The function is async to match the build-script contract (every other
 * `tools/famous/*` entry point is async), but the body is intentionally
 * sync — `fs.copyFileSync` is faster than the promise variant at these
 * file sizes and removes any ordering ambiguity in the
 * missing/copied/skipped counts.
 */
export async function copyHiResToPublic(opts: CopyHiResOptions = {}): Promise<CopyHiResResult> {
  const sourceDir = resolve(opts.sourceDir ?? DEFAULT_SOURCE);
  const destDir = resolve(opts.destDir ?? DEFAULT_DEST);

  // The source directory not existing is unusual but not fatal — a
  // fresh clone with no curator output yet just produces an empty
  // result.  Surfacing zero copies / zero missing is honest.
  if (!existsSync(sourceDir)) {
    return { copied: 0, skipped: 0, missing: [] };
  }

  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  let copied = 0;
  let skipped = 0;
  const missing: string[] = [];

  const ids = readdirSync(sourceDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    // Sort for deterministic logs across runs.  readdirSync order is
    // filesystem-specific (alphabetical on APFS, inode-order on some
    // Linux filesystems), and a stable build log is much easier to diff
    // when reviewing changes.
    .sort();

  for (const id of ids) {
    // Delegate the skip/copy/stamp to the shared primitive so this bulk path
    // and the curator's per-galaxy Commit stay byte-for-byte consistent.
    const result = copyIfChanged(join(sourceDir, id, 'full.webp'), join(destDir, `${id}.webp`));
    if (result === 'missing') missing.push(id);
    else if (result === 'skipped') skipped++;
    else copied++;
  }

  return { copied, skipped, missing };
}

// CLI entry point.  Mirrors the bottom of tools/famous/buildFamous.ts:
// invoke main() when the script is run directly, no-op when imported.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  copyHiResToPublic()
    .then((result) => {
      process.stderr.write(
        `copy-hi-res: copied ${result.copied}, skipped ${result.skipped}, missing ${result.missing.length}\n`,
      );
      if (result.missing.length > 0) {
        process.stderr.write(`  missing: ${result.missing.join(', ')}\n`);
      }
    })
    .catch((err: unknown) => {
      process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    });
}
