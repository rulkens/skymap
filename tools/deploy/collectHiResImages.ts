/**
 * Enumerate the hi-res famous-galaxy WebPs that should ship to R2.
 *
 * The build pipeline writes one `<id>.webp` per curated galaxy into
 * `public/data/images/famous-hires/` (see `tools/famous/copyHiResToPublic.ts`).
 * That directory is a sibling of the flat `*.bin` listing that the existing
 * `syncR2` sweep handles, but it sits one level deeper — so `readdirSync` on
 * the top of `public/data/` doesn't see them.  Rather than make the main
 * sweep recursive (which would also pick up unrelated files Vite drops into
 * `public/data/` during development), we list this one well-known subdir
 * explicitly here.
 *
 * Returning an `Array<{ localPath, r2Key }>` mirrors the shape of the
 * existing `EXTRA_FILES` table in `syncR2.ts`, which keeps the uploader's
 * inner loop a single shape: `for ({ localPath, r2Key } of …) uploadFile(…)`.
 *
 * The R2 key is `data/images/famous-hires/<file>` — the `data/` prefix
 * matches the prefix used for the .bin files, so `dataUrl()` (in
 * `src/services/loading/fetchWithProgress.ts`) resolves
 * `'images/famous-hires/<id>.webp'` cleanly under the same base URL.
 *
 * Pure / side-effect-free apart from the directory read: returns an empty
 * array when the directory is absent (a fresh checkout that hasn't run
 * `npm run build-famous-hires` yet should not fail the sync).  Only files
 * ending in `.webp` are returned — sidecars or stray files don't get
 * uploaded.
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
