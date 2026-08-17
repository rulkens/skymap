import { execSync } from 'node:child_process';
import { statSync } from 'node:fs';
import type { R2Upload } from './R2Upload';

/**
 * Upload one file by shelling out to wrangler.
 *
 * `--remote` targets the real bucket rather than wrangler's local simulator;
 * `--force` skips the interactive data-catalog prompt so an unattended sync
 * doesn't block on stdin.
 *
 * One process spawn per file, which is why this transport suits a few dozen
 * large artefacts and not thousands of small ones.
 */
export function uploadViaWrangler(
  { localPath, r2Key }: R2Upload,
  bucket: string,
  cacheControl: string,
): void {
  const sizeMB = (statSync(localPath).size / 1024 / 1024).toFixed(1);
  console.log(`▶ ${localPath} (${sizeMB} MB) → r2://${bucket}/${r2Key}`);
  execSync(
    `npx wrangler r2 object put ${bucket}/${r2Key}` +
      ` --file ${localPath}` +
      ` --cache-control "${cacheControl}"` +
      ` --remote --force`,
    { stdio: 'inherit' },
  );
}
