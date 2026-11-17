import { existsSync, readFileSync } from 'node:fs';

/** The digest a committed `<path>.sha256` sidecar pins (`sha256sum` format), or null when none. */
export function readSha256Sidecar(path: string): string | null {
  const sidecar = `${path}.sha256`;
  return existsSync(sidecar) ? (readFileSync(sidecar, 'utf8').split(/\s+/)[0] ?? null) : null;
}
