import { rename, writeFile } from 'node:fs/promises';

/** Writes beside the target, then renames over it: a reader sees the old file or the new, never half. */
export async function writeFileAtomically(path: string, data: string, mode = 0o644): Promise<void> {
  await writeFile(`${path}.tmp`, data, { mode });
  await rename(`${path}.tmp`, path);
}
