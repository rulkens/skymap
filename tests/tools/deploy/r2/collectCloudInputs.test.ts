/** The mirror must hold exactly the registry's cloud inputs: a stray file would be public, a missing one breaks CI. */
import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectCloudInputs } from '../../../../tools/deploy/r2/collectCloudInputs';

describe('collectCloudInputs', () => {
  it('keys every present cloud input by its registry path and nothing else', () => {
    const root = mkdtempSync(join(tmpdir(), 'syncr2-cloud-inputs-'));
    const dir = join(root, 'data/raw/textures');
    mkdirSync(dir, { recursive: true });
    for (const name of [
      'cloud_combined_8192.tif',
      'world.topo.bathy.200401.3x21600x10800.jpg',
      'world.topo.bathy.200412.3x21600x10800.jpg',
      'world.topo.bathy.200408.3x21600x21600.A1.jpg',
      '8k_mars.jpg',
    ]) {
      writeFileSync(join(dir, name), Buffer.from([1]));
    }
    expect(collectCloudInputs(root).map((u) => u.r2Key)).toEqual([
      'data/raw/textures/cloud_combined_8192.tif',
      'data/raw/textures/world.topo.bathy.200401.3x21600x10800.jpg',
      'data/raw/textures/world.topo.bathy.200412.3x21600x10800.jpg',
    ]);
  });
});
