/**
 * upsertAsset is the manifest's read-modify-write core: both the bake CLI
 * and (plan 3) the nudge endpoint call it on a freshly re-read manifest, so
 * an untouched sibling asset must survive by reference — a rebuild would
 * make every write touch every asset's identity, which is indistinguishable
 * from data loss to anything diffing the file.
 */
import { describe, it, expect } from 'vitest';
import { upsertAsset } from '../../../../tools/scene-recon/manifest/upsertAsset';
import type { SceneManifest } from '../../../../tools/scene-workbench/@types/SceneManifest';
import type { PointCloudAsset } from '../../../../tools/scene-workbench/@types/PointCloudAsset';

function makeAsset(id: string): PointCloudAsset {
  return {
    id,
    label: id,
    kind: 'pointCloud',
    pointCount: 100,
    artifactUrl: `${id}/points.bin`,
    transform: {
      translationM: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: 1,
    },
    provenance: {
      source: 'nationalGeodataApi',
      sourceVintage: '2024-01-01',
      pipeline: [],
    },
  };
}

function makeManifest(assets: readonly PointCloudAsset[]): SceneManifest {
  return {
    formatVersion: 1,
    groupId: 'test-group',
    groupName: 'Test Group',
    anchor: {
      kind: 'geodetic',
      latDeg: 55.6,
      lonDeg: 12.5,
      heightMDvr90: 0,
      headingDeg: 0,
    },
    assets,
  };
}

describe('upsertAsset', () => {
  it('replaces the named asset and leaves siblings identical', () => {
    const a1 = makeAsset('a1');
    const a2 = makeAsset('a2');
    const a3 = makeAsset('a3');
    const manifest = makeManifest([a1, a2, a3]);
    const replacement = { ...makeAsset('a2'), pointCount: 999 };

    const result = upsertAsset(manifest, replacement);

    expect(result.assets[0]).toBe(a1);
    expect(result.assets[2]).toBe(a3);
    expect(result.assets[1]).toBe(replacement);
    expect(result.assets).toHaveLength(3);
    expect(result.anchor).toBe(manifest.anchor);
    expect(result.formatVersion).toBe(manifest.formatVersion);
    expect(result.groupId).toBe(manifest.groupId);
    expect(result.groupName).toBe(manifest.groupName);
  });

  it('appends an unknown asset id', () => {
    const a1 = makeAsset('a1');
    const a2 = makeAsset('a2');
    const manifest = makeManifest([a1, a2]);
    const newAsset = makeAsset('a3');

    const result = upsertAsset(manifest, newAsset);

    expect(result.assets).toHaveLength(3);
    expect(result.assets[0]).toBe(a1);
    expect(result.assets[1]).toBe(a2);
    expect(result.assets[2]).toBe(newAsset);
  });
});
