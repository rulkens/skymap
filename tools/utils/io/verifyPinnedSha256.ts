import { createHash } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';

/**
 * Check `filePath` against the hash a combined `shasum -a 256` sidecar pins for `filename`, and
 * return it. Unlike `upsertSha256Sidecar` it never bootstraps a missing line: a missing pin throws
 * too, so CI never trusts bytes nobody has checked.
 */
export async function verifyPinnedSha256(
  filePath: string,
  filename: string,
  sidecarPath: string,
): Promise<string> {
  const pinned = readFileSync(sidecarPath, 'utf8')
    .split(/\r?\n/)
    .find((line) => line.trimEnd().endsWith(`  ${filename}`))
    ?.split(/\s+/)[0];
  if (pinned === undefined) {
    throw new Error(`${filename} has no pin in ${sidecarPath}; pin it before fetching it here`);
  }
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);
  const digest = hash.digest('hex');
  if (digest !== pinned) {
    throw new Error(
      `sha256 mismatch for ${filename}: pinned ${pinned}, got ${digest}. ` +
        `Delete ${filePath} and re-run to fetch it again.`,
    );
  }
  return digest;
}
