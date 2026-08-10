import { createHash } from 'node:crypto';

/**
 * The first 8 lowercase-hex characters of the SHA-256 of `bytes` — the
 * content-hash infix `buildDataManifest` inserts into every tracked
 * filename. 8 hex chars (32 bits) is plenty to avoid collisions across the
 * few hundred tracked files without bloating URLs.
 */
export function contentHash8(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 8);
}
