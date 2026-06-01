/**
 * publishFamousRuntimeImages — copy one curated galaxy's two image tiers from
 * the committed master dir to the locations the runtime actually reads.
 *
 * This module is the SINGLE SOURCE OF TRUTH for the famous-galaxy runtime image
 * layout (write side).  Both the curator's Commit (`routes/export.ts`) and the
 * bulk regeneration step (`copyHiResToPublic.ts`) import the paths + the
 * idempotent copy primitive from here, so "where does the runtime read each
 * tier" is defined once.
 *
 * ── The two tiers, and why they're treated differently ────────────────
 *
 *   master:  public/images/famous-curated/<id>/{atlas.webp, full.webp}
 *            ↑ committed; the curator's self-contained per-galaxy output.
 *
 *   low-res: public/images/famous/<id>.webp           ← from atlas.webp (256²)
 *            ↑ COMMITTED, ships free with the static shell (Workers Assets).
 *
 *   hi-res:  public/data/images/famous-hires/<id>.webp ← from full.webp (1024²)
 *            ↑ GITIGNORED (all of /public/data/ is), served from R2.  Because
 *              it's a build artifact it must be regenerable from the committed
 *              master — that's why the bulk step exists and why this copy is
 *              part of the pipeline rather than something the curator could skip.
 *
 * The runtime read side (`src/utils/network/galaxyImageFetcher.ts`) encodes the
 * matching URLs `/images/famous/<id>.webp` and `images/famous-hires/<id>.webp`;
 * those two templates must stay in agreement with the dirs below.
 */
import { copyFileSync, existsSync, mkdirSync, statSync, utimesSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** Low-res runtime slot — committed, served with the static shell. */
export const LOWRES_RUNTIME_DIR = 'public/images/famous';
/** Hi-res runtime slot — gitignored build artifact, served from R2. */
export const HIRES_RUNTIME_DIR = 'public/data/images/famous-hires';
/** The curator's committed per-galaxy master dir. */
export const CURATED_DIR = 'public/images/famous-curated';

/** Per-tier publish outcome. */
export type TierResult = 'copied' | 'skipped' | 'missing';

export type PublishResult = {
  lowRes: TierResult;
  hiRes: TierResult;
};

/**
 * Copy `src` → `dst`, idempotently.  Returns:
 *   'missing'  — src does not exist (caller decides whether that's expected)
 *   'skipped'  — dst already in sync (same whole-second mtime AND size)
 *   'copied'   — bytes written + dst mtime stamped to match src
 *
 * Whole-second mtime comparison mirrors make/rsync: `utimesSync` writes
 * seconds-precision on most platforms, so exact-ms equality would falsely
 * report "stale" and re-copy every run.  Stamping dst's mtime to src's keeps
 * the next run's skip check matching (a plain copy would set dst mtime to now).
 */
export function copyIfChanged(src: string, dst: string): TierResult {
  if (!existsSync(src)) return 'missing';
  const srcStat = statSync(src);
  if (existsSync(dst)) {
    const dstStat = statSync(dst);
    if (
      Math.floor(dstStat.mtimeMs / 1000) === Math.floor(srcStat.mtimeMs / 1000) &&
      dstStat.size === srcStat.size
    ) {
      return 'skipped';
    }
  }
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  utimesSync(dst, srcStat.atime, srcStat.mtime);
  return 'copied';
}

/** Absolute path of a curated master tier (`atlas.webp` / `full.webp`). */
export function curatedTierPath(repoRoot: string, id: string, file: string): string {
  return resolve(repoRoot, CURATED_DIR, id, file);
}

/** Absolute path of the committed low-res runtime slot. */
export function lowResRuntimePath(repoRoot: string, id: string): string {
  return resolve(repoRoot, LOWRES_RUNTIME_DIR, `${id}.webp`);
}

/** Absolute path of the gitignored hi-res runtime slot. */
export function hiResRuntimePath(repoRoot: string, id: string): string {
  return resolve(repoRoot, HIRES_RUNTIME_DIR, `${id}.webp`);
}

/**
 * Publish both runtime tiers for one curated galaxy.  Called by the curator's
 * Commit so the running app reflects the curation completely — low-res AND
 * hi-res — with no separate build step.  Idempotent per tier.
 */
export function publishFamousRuntimeImages(opts: { repoRoot: string; id: string }): PublishResult {
  const { repoRoot, id } = opts;
  return {
    lowRes: copyIfChanged(
      curatedTierPath(repoRoot, id, 'atlas.webp'),
      lowResRuntimePath(repoRoot, id),
    ),
    hiRes: copyIfChanged(
      curatedTierPath(repoRoot, id, 'full.webp'),
      hiResRuntimePath(repoRoot, id),
    ),
  };
}
