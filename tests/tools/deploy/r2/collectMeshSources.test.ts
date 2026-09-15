/**
 * Contract test for the mesh-sources R2 inventory helper.
 *
 * `meshes.sha256` lines are fixed-width (`shasum -a 256` text-mode output):
 * 64 hex chars, two spaces, then the path verbatim. Every NASA source
 * filename in that list carries spaces and parentheses (e.g.
 * "Voyager Probe (B).glb"), so a naive whitespace split would truncate the
 * key at the first space — this pins the fixed-offset parse instead.
 */
import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectMeshSources } from '../../../../tools/deploy/r2/collectMeshSources';

function fixtureDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'syncr2-meshes-'));
  mkdirSync(join(dir, 'voyager'), { recursive: true });
  writeFileSync(join(dir, 'voyager', 'Voyager Probe (B).glb'), Buffer.from([1, 2, 3]));
  writeFileSync(join(dir, 'voyager', 'voyager.blend'), Buffer.from([4, 5, 6]));
  writeFileSync(
    join(dir, 'meshes.sha256'),
    `${'a'.repeat(64)}  voyager/Voyager Probe (B).glb\n${'b'.repeat(64)}  voyager/voyager.blend\n`,
  );
  return dir;
}

describe('collectMeshSources', () => {
  it('keeps a filename with spaces and parentheses as one key', () => {
    const dir = fixtureDir();
    const inventory = collectMeshSources(dir);
    const keys = inventory.map((entry) => entry.r2Key);
    expect(keys).toEqual([
      'data/raw/meshes/voyager/Voyager Probe (B).glb',
      'data/raw/meshes/voyager/voyager.blend',
    ]);
  });
});
