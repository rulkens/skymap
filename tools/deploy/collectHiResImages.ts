/**
 * Enumerate the hi-res famous-galaxy WebPs that should ship to R2.
 *
 * The build pipeline writes one `<id>.webp` per curated galaxy into
 * `public/data/images/famous-hires/` (see `tools/famous/copyHiResToPublic.ts`).
 * That directory is one level below the flat `*.bin` listing the main
 * `syncR2` sweep handles, so `readdirSync` on top of `public/data/`
 * doesn't see it.  Listing this one well-known subdir explicitly is
 * safer than a recursive walk, which would risk picking up unrelated
 * files Vite drops into `public/data/` during development.
 *
 * Returns `Array<{ localPath, r2Key }>` — same shape as `EXTRA_FILES`
 * in `syncR2.ts`, so the uploader's inner loop stays uniform:
 * `for ({ localPath, r2Key } of …) uploadFile(…)`.
 *
 * The R2 key is `data/images/famous-hires/<file>` — the `data/` prefix
 * matches the .bin files, so `dataUrl()` (in
 * `src/services/loading/fetchWithProgress.ts`) resolves
 * `'images/famous-hires/<id>.webp'` cleanly under the same base URL.
 *
 * Pure apart from the directory read: returns an empty array when the
 * directory is absent (a fresh checkout that hasn't run
 * `npm run build-famous-hires` should not fail the sync).  Only files
 * ending in `.webp` are returned.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type HiResImageUpload = {
  readonly localPath: string;
  readonly r2Key: string;
};

export function collectHiResImages(sourceDir: string): HiResImageUpload[] {
  if (!existsSync(sourceDir)) return [];
  return readdirSync(sourceDir)
    .filter((name) => name.endsWith('.webp'))
    .filter((name) => statSync(join(sourceDir, name)).isFile())
    .sort()
    .map((name) => ({
      localPath: join(sourceDir, name),
      r2Key: `data/images/famous-hires/${name}`,
    }));
}
