/**
 * dataManifest — boot-fetched logical→hashed path table (Task 11's
 * `DataManifest`, written by the post-pass as `public/data/manifest.json`).
 * Memoized on a module-level promise so every reader before boot shares one
 * fetch. Production has no reset — tests reset via `vi.resetModules()` plus
 * a dynamic `import()`.
 */

import { dataBaseUrl } from '../../utils/network/dataBaseUrl';
import type { DataManifest } from '../../@types/data/DataManifest';

let manifest: DataManifest = {};
let fetched: Promise<void> | null = null;

/**
 * Fetch `<base>/data/manifest.json` once, `cache: 'no-cache'`. Memoized on a
 * module-level promise; NEVER rejects — a missing or unparseable manifest
 * leaves resolution as identity.
 */
export function loadDataManifest(): Promise<void> {
  if (fetched) return fetched;
  fetched = fetch(`${dataBaseUrl()}/data/manifest.json`, { cache: 'no-cache' })
    .then((res) => (res.ok ? (res.json() as Promise<DataManifest>) : undefined))
    .then((json) => {
      if (json) manifest = json;
    })
    .catch(() => {});
  return fetched;
}

/**
 * Logical data path → the hashed path the build wrote. Identity for anything
 * the manifest does not name (the whole `images/` tree, a worktree that never
 * ran the pass).
 */
export function resolveDataPath(logicalPath: string): string {
  return manifest[logicalPath] ?? logicalPath;
}
