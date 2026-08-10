import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { DataManifest } from '../../../src/@types/data/DataManifest';
import { logicalDataName } from '../../utils/data/logicalDataName';
import { walkDataFiles } from '../../utils/data/walkDataFiles';
import { allowDataFile } from './allowDataFile';
import type { R2Upload } from './R2Upload';

/**
 * The `public/data/` upload set — read straight off `manifest.json` rather
 * than walking disk, because the manifest's *values* are exactly the hashed
 * files that must ship (Task 11's post-pass already picked one keeper per
 * logical name). A drift guard runs first and throws before any byte moves:
 * a stale or partial manifest must never publish silently.
 *
 *   1. no manifest.json — the sync hasn't been prepared at all.
 *   2. a manifest value absent on disk — the manifest describes a build
 *      that no longer exists locally.
 *   3. a tracked file still under its *logical* name — a builder ran
 *      without its `build-data-manifest` tail, so the manifest on disk
 *      describes the previous generation, not this one.
 */
export function collectDataFiles(sourceDir: string): R2Upload[] {
  const manifestPath = join(sourceDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(
      `No manifest.json in ${sourceDir} — run "npm run build-data-manifest" before syncing.`,
    );
  }
  const manifest: DataManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  for (const hashedRel of Object.values(manifest)) {
    if (!existsSync(join(sourceDir, hashedRel))) {
      throw new Error(
        `manifest.json names ${hashedRel}, which is not on disk — run "npm run build-data-manifest".`,
      );
    }
  }

  for (const rel of walkDataFiles(sourceDir)) {
    if (!allowDataFile(rel)) continue;
    const name = basename(rel);
    if (logicalDataName(name) === name) {
      throw new Error(
        `${rel} is tracked but still has its logical name — a builder ran without ` +
          `"npm run build-data-manifest"; publishing now would ship a manifest that ` +
          `describes the previous generation.`,
      );
    }
  }

  return Object.values(manifest)
    .sort()
    .map((hashedRel) => ({ localPath: join(sourceDir, hashedRel), r2Key: `data/${hashedRel}` }));
}
