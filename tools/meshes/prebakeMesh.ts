/**
 * prebakeMesh — runs `meshPrebake.py` in Blender for one mesh key, passing the
 * ground-up direction (`meshGroundUpSource`) through so the Python side can
 * build its occluder plane without re-deriving which meshes sit on a ground.
 * `npm run prebake-mesh -- <key>` (Blender 5.2 LTS; not run in CI).
 */

import { spawnSync } from 'node:child_process';

import { MESH_TRIANGLE_BUDGET } from '../../src/data/mesh/meshTriangleBudget';
import { meshGroundUpSource } from '../utils/meshes/meshGroundUpSource';

const DEFAULT_BLENDER = '/Applications/Blender.app/Contents/MacOS/Blender';
const MESH_PREBAKE_PY = 'tools/meshes/prebake/meshPrebake.py';

const key = process.argv[2];
if (!key) {
  process.stderr.write('prebakeMesh: pass a mesh key, e.g. `npm run prebake-mesh -- mer`\n');
  process.exit(1);
}
// An unknown key is refused by meshPrebake.py's argparse `choices`, with the valid list.
const groundUp = meshGroundUpSource(key);
const args = [
  '--background',
  '--factory-startup',
  '--python',
  MESH_PREBAKE_PY,
  '--',
  key,
  '--triangles',
  String(MESH_TRIANGLE_BUDGET),
  ...(groundUp ? ['--ground-up', ...groundUp.map(String)] : []),
];
const result = spawnSync(process.env.BLENDER ?? DEFAULT_BLENDER, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
