/**
 * prebakeMesh — runs `meshPrebake.py` in Blender for one mesh key, passing the
 * ground-up direction (`meshGroundUpSource`) through so the Python side can
 * build its occluder plane without re-deriving which meshes sit on a ground.
 * `npm run prebake-mesh -- <key>` (Blender 5.2 LTS; not run in CI).
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { MESH_SOURCES } from '../utils/io/meshSources';
import { meshGroundUpSource } from '../utils/meshes/meshGroundUpSource';

const DEFAULT_BLENDER = '/Applications/Blender.app/Contents/MacOS/Blender';
const MESH_PREBAKE_PY = 'tools/meshes/prebake/meshPrebake.py';

export function prebakeMesh(key: string): number {
  if (!(key in MESH_SOURCES)) {
    throw new Error(
      `prebakeMesh: pass one of ${Object.keys(MESH_SOURCES).sort().join(', ')}, not '${key}'`,
    );
  }
  const groundUp = meshGroundUpSource(key);
  const args = [
    '--background',
    '--factory-startup',
    '--python',
    MESH_PREBAKE_PY,
    '--',
    key,
    ...(groundUp ? ['--ground-up', groundUp.join(',')] : []),
  ];
  const blender = process.env.BLENDER ?? DEFAULT_BLENDER;
  const result = spawnSync(blender, args, { stdio: 'inherit' });
  return result.status ?? 1;
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const key = process.argv[2];
  if (!key) {
    process.stderr.write('prebakeMesh: pass a mesh key, e.g. `npm run prebake-mesh -- mer`\n');
    process.exit(1);
  }
  process.exit(prebakeMesh(key));
}
