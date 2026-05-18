/**
 * Pure path-resolution helpers for the curator.
 *
 * All exports are pure functions of the repo root + ids.  No filesystem
 * I/O happens here — callers compose these with `existsSync` / `mkdir`
 * as needed.  Keeping the resolver pure makes Plan B's API tests
 * trivially driveable with a tmpdir fixture root.
 *
 * The layout below mirrors the spec's "Output layout" section:
 *
 *   public/images/famous-curated/<id>/   — final, atomic-renamed
 *   public/images/famous-curated/<id>/.tmp/  — staging dir before rename
 *   data/famous_curated_overrides.json   — committed override index
 *   public/images/famous/<id>.webp       — existing atlas slot, owned
 *                                          by fetchFamousImages.ts but
 *                                          referenced here so Plan D
 *                                          can copy curated atlases in.
 */
import { resolve } from 'node:path';

export function curatedDir(repoRoot: string): string {
  return resolve(repoRoot, 'public/images/famous-curated');
}

export function curatedGalaxyDir(repoRoot: string, id: string): string {
  return resolve(curatedDir(repoRoot), id);
}

export function curatedTmpDir(repoRoot: string, id: string): string {
  return resolve(curatedGalaxyDir(repoRoot, id), '.tmp');
}

export function overrideIndexPath(repoRoot: string): string {
  return resolve(repoRoot, 'data/famous_curated_overrides.json');
}

export function atlasOutputPath(repoRoot: string, id: string): string {
  return resolve(repoRoot, 'public/images/famous', `${id}.webp`);
}
