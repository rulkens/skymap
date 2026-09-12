/**
 * Both writes land under a relative `public/data/geo3d`, so this runs against a
 * tmpdir cwd and needs vitest's `forks` pool — `process.chdir` is undefined
 * under `threads` (`vitest.config.ts` sets no `pool`; v4 defaults to forks).
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { publishAsset } from '../../../../tools/scene-recon/manifest/publishAsset';
import { SOENDERMARKEN } from '../../../../tools/scene-recon/groups/soendermarken';
import type { PointCloudAsset } from '../../../../tools/scene-workbench/@types/PointCloudAsset';
import type { GroupRegistry } from '../../../../tools/scene-workbench/@types/GroupRegistry';
import type { BoundsM } from '../../../../tools/scene-workbench/@types/BoundsM';
import type { SceneManifest } from '../../../../tools/scene-workbench/@types/SceneManifest';

const ASSET: PointCloudAsset = {
  kind: 'pointCloud',
  id: 'lidar',
  label: 'first',
  transform: { translationM: [0, 0, 0], rotation: [0, 0, 0, 1], scale: 1 },
  provenance: {
    source: 'nationalGeodataApi',
    sourceVintage: '2011-09-20',
    pipeline: [{ step: 'pdal', version: '2.9.0' }],
  },
  pointCount: 3,
  artifactUrl: `geo3d/groups/${SOENDERMARKEN.id}/assets/lidar/points.bin`,
};

const BOUNDS: BoundsM = { min: [-129, -91, -18], max: [129, 91, 22] };

let root: string;
let previousCwd: string;

beforeAll(() => {
  previousCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), 'publish-asset-'));
  process.chdir(root);
});

afterAll(() => {
  process.chdir(previousCwd);
  rmSync(root, { recursive: true, force: true });
});

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(root, path), 'utf8')) as T;
}

describe('publishAsset', () => {
  it('upserts the asset into the group manifest and the group into scenes.json', async () => {
    await publishAsset(SOENDERMARKEN, ASSET);

    const manifest = readJson<SceneManifest>(
      `public/data/geo3d/groups/${SOENDERMARKEN.id}/manifest.json`,
    );
    expect(manifest.groupId).toBe(SOENDERMARKEN.id);
    expect(manifest.assets).toContainEqual(ASSET);

    expect(readJson<GroupRegistry>('public/data/geo3d/scenes.json').groups).toContainEqual({
      id: SOENDERMARKEN.id,
      name: SOENDERMARKEN.name,
      manifestUrl: `geo3d/groups/${SOENDERMARKEN.id}/manifest.json`,
    });
  });

  it('re-publishing replaces the asset and the group rather than appending', async () => {
    await publishAsset(SOENDERMARKEN, { ...ASSET, label: 'second' });

    const manifest = readJson<SceneManifest>(
      `public/data/geo3d/groups/${SOENDERMARKEN.id}/manifest.json`,
    );
    expect(manifest.assets).toHaveLength(1);
    expect(manifest.assets[0]!.label).toBe('second');
    expect(readJson<GroupRegistry>('public/data/geo3d/scenes.json').groups).toHaveLength(1);
  });

  it("keeps the LiDAR bake's boundsM when a later bake publishes without one", async () => {
    await publishAsset(SOENDERMARKEN, ASSET, BOUNDS);
    await publishAsset(SOENDERMARKEN, { ...ASSET, id: 'splats' });

    const manifest = readJson<SceneManifest>(
      `public/data/geo3d/groups/${SOENDERMARKEN.id}/manifest.json`,
    );
    expect(manifest.boundsM).toEqual(BOUNDS);
    expect(manifest.assets).toHaveLength(2);
  });
});
