import { execSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import type { R2Upload } from './R2Upload';
import { shouldGzipOnWire } from './shouldGzipOnWire';

const CONTENT_TYPES: Record<string, string> = {
  '.bin': 'application/octet-stream',
  '.scfd': 'application/octet-stream',
  '.ccat': 'application/octet-stream',
  '.json': 'application/json',
};

function contentTypeFor(path: string): string | undefined {
  return CONTENT_TYPES[extname(path)];
}

/**
 * Upload one file by shelling out to wrangler.
 *
 * `--remote` targets the real bucket rather than wrangler's local simulator;
 * `--force` skips the interactive data-catalog prompt so an unattended sync
 * doesn't block on stdin.
 *
 * One process spawn per file, which is why this transport suits a few dozen
 * large artefacts and not thousands of small ones.
 *
 * Eligible files (see `shouldGzipOnWire`) are gzipped to a temp path first
 * and uploaded with `--content-encoding gzip`; the browser's fetch/decoder
 * transparently inflates them, so nothing downstream of the network needs to
 * know. `syncGroup`'s local ETag hash must be computed over these same
 * gzipped bytes — see `localUploadHash`.
 */
export function uploadViaWrangler(
  { localPath, r2Key }: R2Upload,
  bucket: string,
  cacheControl: string,
): void {
  const sizeMB = (statSync(localPath).size / 1024 / 1024).toFixed(1);
  console.log(`▶ ${localPath} (${sizeMB} MB) → r2://${bucket}/${r2Key}`);

  const gzip = shouldGzipOnWire(localPath);
  const uploadPath = gzip ? writeTempGzip(localPath) : localPath;
  const contentType = contentTypeFor(localPath);

  try {
    execSync(
      `npx wrangler r2 object put ${bucket}/${r2Key}` +
        ` --file ${uploadPath}` +
        ` --cache-control "${cacheControl}"` +
        (contentType ? ` --content-type "${contentType}"` : '') +
        (gzip ? ` --content-encoding gzip` : '') +
        ` --remote --force`,
      { stdio: 'inherit' },
    );
  } finally {
    if (gzip) rmSync(dirname(uploadPath), { recursive: true, force: true });
  }
}

function writeTempGzip(localPath: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'skymap-r2-gzip-'));
  const dest = join(dir, basename(localPath));
  writeFileSync(dest, gzipSync(readFileSync(localPath)));
  return dest;
}
