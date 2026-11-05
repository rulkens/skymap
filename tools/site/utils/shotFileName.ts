import { createHash } from 'node:crypto';

/**
 * A site shot's file name, `<name>-<width>.<hash>.<ext>`: the hash is the first 8 hex digits of the bytes'
 * SHA-256, so a retake gets a new URL and the files can be cached for a year (public/_headers).
 */
export function shotFileName(name: string, width: number, ext: string, bytes: Uint8Array): string {
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
  return `${name}-${width}.${hash}.${ext}`;
}
