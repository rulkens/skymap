/**
 * nextManifest — a stale `current` manifest (last written before an
 * anchor/name edit) must not survive a re-bake: only `assets[]` is
 * preserved across calls, every other top-level field comes from `group`.
 */
import { describe, it, expect } from 'vitest';
import { nextManifest } from '../../../../tools/scene-recon/manifest/nextManifest';
import type { SceneGroupDefinition } from '../../../../tools/scene-recon/groups/soendermarken';
import type { SceneManifest } from '../../../../tools/scene-workbench/@types/SceneManifest';
import type { PointCloudAsset } from '../../../../tools/scene-workbench/@types/PointCloudAsset';

function makeAsset(id: string): PointCloudAsset {
  return {
    id,
    label: id,
    kind: 'pointCloud',
    pointCount: 100,
    artifactUrl: `${id}/points.bin`,
    transform: { translationM: [0, 0, 0], rotation: [0, 0, 0, 1], scale: 1 },
    provenance: { source: 'nationalGeodataApi', sourceVintage: '2024-01-01', pipeline: [] },
  };
}

const GROUP: SceneGroupDefinition = {
  id: 'soendermarken',
  name: 'Søndermarken',
  anchor: { kind: 'geodetic', latDeg: 55.67, lonDeg: 12.53, heightMDvr90: 18.53, headingDeg: 0 },
  bounds: { west: 12.51, south: 55.662, east: 12.55, north: 55.678 },
  dhmTiles: [],
  sourceSrs: 'EPSG:25832',
  minPointSpacingM: 1,
  dropClassifications: [7, 18],
};

describe('nextManifest', () => {
  it('replaces a stale anchor and name from a prior bake, not just the asset', () => {
    const staleManifest: SceneManifest = {
      formatVersion: 1,
      groupId: 'soendermarken',
      groupName: 'Old Name',
      anchor: { kind: 'geodetic', latDeg: 0, lonDeg: 0, heightMDvr90: 0, headingDeg: 0 },
      assets: [makeAsset('lidar')],
    };
    const updated = makeAsset('lidar');

    const result = nextManifest(staleManifest, GROUP, updated);

    expect(result.anchor).toEqual(GROUP.anchor);
    expect(result.groupName).toBe('Søndermarken');
    expect(result.groupId).toBe('soendermarken');
    expect(result.assets).toEqual([updated]);
  });

  it('starts an empty manifest from group fields when current is null', () => {
    const asset = makeAsset('lidar');

    const result = nextManifest(null, GROUP, asset);

    expect(result).toEqual({
      formatVersion: 1,
      groupId: 'soendermarken',
      groupName: 'Søndermarken',
      anchor: GROUP.anchor,
      assets: [asset],
    });
  });

  it('keeps an untouched sibling asset by reference', () => {
    const sibling = makeAsset('other');
    const manifest: SceneManifest = {
      formatVersion: 1,
      groupId: 'soendermarken',
      groupName: 'Søndermarken',
      anchor: GROUP.anchor,
      assets: [sibling],
    };
    const asset = makeAsset('lidar');

    const result = nextManifest(manifest, GROUP, asset);

    expect(result.assets).toHaveLength(2);
    expect(result.assets[0]).toBe(sibling);
    expect(result.assets[1]).toBe(asset);
  });
});
