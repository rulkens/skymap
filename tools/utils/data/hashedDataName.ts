/**
 * Insert a content-hash infix immediately before a data filename's
 * extension: `('sdss-large.bin', 'a3f19c2e')` → `'sdss-large.a3f19c2e.bin'`.
 * `logicalDataName` is the inverse.
 */
export function hashedDataName(logicalName: string, hash: string): string {
  const dot = logicalName.lastIndexOf('.');
  if (dot <= 0) return `${logicalName}.${hash}`;
  return `${logicalName.slice(0, dot)}.${hash}${logicalName.slice(dot)}`;
}
