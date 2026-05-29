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
 * Keeping flattening as a separate step rather than asking the curator
 * to write both layouts has two benefits:
 *
 *  1. The curator's output stays self-contained — a single directory
 *     per galaxy holds every byproduct, easy to delete + re-curate.
 *  2. The build pipeline owns the deploy-shape, so changing the runtime
 *     URL convention is a one-file edit here, not a curator change.
 *
 * ── Idempotency ───────────────────────────────────────────────────────
 *
 * This step runs as part of `build-tiers` / `build-all` and gets invoked
 * many times in a typical day's work.  A naive "copy every full.webp on
 * every run" would re-encode dozens of MB for no signal change — and
 * worse, would touch the destination mtimes, which defeats downstream
 * caching (`syncR2`'s skip-if-already-on-R2 check is mtime-aware in
 * spirit, and Vite's HMR watches the dest tree).
 *
 * Skip rule: dest exists AND (source.mtime, source.size) match the
 * dest's (mtime, size).  When we DO copy, we set the dest's mtime to
 * the source's mtime via `utimes` so subsequent runs find the match.
 *
 * Why mtime+size, not a checksum?  Curator runs are append-only — a
 * re-render REWRITES `full.webp` with a fresh mtime, even if the bytes
 * happen to be identical.  So mtime is a stronger signal than content
 * hash for "did the curator touch this entry", and avoiding the
 * per-file SHA keeps the build step under 100 ms for 75 entries.
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
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, utimesSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type CopyHiResOptions = {
  /** Source root.  Defaults to `public/images/famous-curated` relative to CWD. */
  sourceDir?: string;
  /** Destination root.  Defaults to `public/data/images/famous-hires` relative to CWD. */
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

const DEFAULT_SOURCE = 'public/images/famous-curated';
const DEFAULT_DEST = 'public/data/images/famous-hires';

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
    const src = join(sourceDir, id, 'full.webp');
    if (!existsSync(src)) {
      missing.push(id);
      continue;
    }
    const dst = join(destDir, `${id}.webp`);
    const srcStat = statSync(src);
    if (existsSync(dst)) {
      const dstStat = statSync(dst);
      // Compare at whole-second resolution.  `fs.utimesSync` accepts a
      // Date but writes seconds-precision on most platforms (the POSIX
      // utimes() syscall takes a `struct timespec` but the Node wrapper
      // truncates), so a round-trip can lose sub-second bits — exact
      // ms equality would falsely report "stale" and re-copy every run.
      // Whole-second match is what `make`, `rsync`, and friends use for
      // the same reason.
      if (
        Math.floor(dstStat.mtimeMs / 1000) === Math.floor(srcStat.mtimeMs / 1000) &&
        dstStat.size === srcStat.size
      ) {
        skipped++;
        continue;
      }
    }
    copyFileSync(src, dst);
    // Stamp the dest's mtime to match the source so the next run's
    // skip check matches.  Without this, copyFileSync sets the dest's
    // mtime to "now", and a subsequent re-run sees a mismatch and
    // re-copies — defeating the idempotency.
    utimesSync(dst, srcStat.atime, srcStat.mtime);
    copied++;
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
