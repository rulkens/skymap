import { renameSync, writeFileSync } from 'node:fs';

/** Write-then-rename, so a killed writer never leaves a torn file a reader trusts. */
export function writeFileAtomic(path: string, bytes: Uint8Array): void {
  writeFileSync(`${path}.tmp`, bytes);
  renameSync(`${path}.tmp`, path);
}
