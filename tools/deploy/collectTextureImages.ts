/**
 * Enumerate the tiered planet-surface textures that should ship to R2.
 *
 * The texture build pipeline writes one `<body>-<size>.{jpg,webp}` per
 * planet/moon surface (and ring sheet) into
 * `public/data/images/textures/`.  Like the hi-res famous-galaxy WebPs,
 * that directory is one level below the flat `*.bin` listing the main
 * `syncR2` sweep handles, so `readdirSync` on top of `public/data/`
 * doesn't see it.  Listing this one well-known subdir explicitly is
 * safer than a recursive walk, which would risk picking up unrelated
 * files Vite drops into `public/data/` during development.
 *
 * Returns `Array<{ localPath, r2Key }>` — same shape as
 * `collectHiResImages` and `EXTRA_FILES` in `syncR2.ts`, so the
 * uploader's inner loop stays uniform:
 * `for ({ localPath, r2Key } of …) uploadFile(…)`.
 *
 * The R2 key is `data/images/textures/<file>` — the `data/` prefix
 * matches the .bin files, so `dataUrl()` (in
 * `src/services/loading/fetchWithProgress.ts`) resolves
 * `'images/textures/<file>'` cleanly under the same base URL.
 *
 * Pure apart from the directory read: returns an empty array when the
 * directory is absent (a code-only deploy that hasn't run the texture
 * build should not fail the sync).  Only files ending in `.jpg` or
 * `.webp` are returned.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type TextureImageUpload = {
  readonly localPath: string;
  readonly r2Key: string;
};

export function collectTextureImages(sourceDir: string): TextureImageUpload[] {
  if (!existsSync(sourceDir)) return [];
  return readdirSync(sourceDir)
    .filter((name) => name.endsWith('.jpg') || name.endsWith('.webp'))
    .filter((name) => statSync(join(sourceDir, name)).isFile())
    .sort()
    .map((name) => ({
      localPath: join(sourceDir, name),
      r2Key: `data/images/textures/${name}`,
    }));
}
