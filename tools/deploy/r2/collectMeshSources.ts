import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { R2Upload } from './R2Upload';
import { RAW_DATA } from '../../utils/io/rawDataRegistry';

/** Bytes of one `shasum -a 256` text-mode line before the path: 64 hex chars + two spaces. */
const PATH_OFFSET = 66;

/** Sliced by fixed offset rather than split on whitespace: NASA filenames like
 * "Voyager Probe (B).glb" carry spaces and parentheses. */
export function collectMeshSources(meshesDir: string): R2Upload[] {
  const sha256Path = join(meshesDir, 'meshes.sha256');
  const lines = readFileSync(sha256Path, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0);
  const uploads: R2Upload[] = [];
  for (const line of lines) {
    const rel = line.slice(PATH_OFFSET);
    const localPath = join(meshesDir, rel);
    if (!existsSync(localPath)) continue;
    uploads.push({ localPath, r2Key: `${RAW_DATA['meshes.dir'].path}/${rel}` });
  }
  return uploads;
}
