/**
 * syntheticProbeScene — the `?probe` gate's in-tool stand-in for a baked
 * LiDAR group (mirrors mcpm-workbench's `syntheticCatalog.ts`): a ground
 * plane plus a raised box, ~10k points total, deterministic. Manifest and
 * points both ride a `Blob` + `URL.createObjectURL`, so the probe needs no
 * baked data; `resolveAssetUrl.ts` is what lets the resulting blob: URLs
 * through the saga's fetches unprefixed.
 */
import type { GroupAnchor } from '../../@types/GroupAnchor';
import type { GroupRegistryEntry } from '../../@types/GroupRegistryEntry';
import type { PointCloudAsset } from '../../@types/PointCloudAsset';
import type { SceneManifest } from '../../@types/SceneManifest';
import { packPoints, type ScenePoint } from '../../../scene-recon/pack/packPoints';

const GROUND_HALF_EXTENT_M = 35;
const GROUND_STEPS = 88; // 89x89 grid, ~7.9k points
const GROUND_RGB = [92, 112, 68] as const; // grass green, ASPRS class 2 (ground)

const BOX_HALF_EXTENT_M = 5;
const BOX_HEIGHT_M = 8;
const BOX_STEPS = 20; // 21x21 per face — 4 walls + roof, ~2.2k points
const BOX_RGB = [150, 122, 92] as const; // masonry tan, ASPRS class 6 (building)

function groundPoints(): ScenePoint[] {
  const points: ScenePoint[] = [];
  const spacing = (2 * GROUND_HALF_EXTENT_M) / GROUND_STEPS;
  for (let i = 0; i <= GROUND_STEPS; i++) {
    const x = -GROUND_HALF_EXTENT_M + i * spacing;
    for (let j = 0; j <= GROUND_STEPS; j++) {
      const y = -GROUND_HALF_EXTENT_M + j * spacing;
      points.push({
        xM: x,
        yM: y,
        zM: 0,
        r: GROUND_RGB[0],
        g: GROUND_RGB[1],
        b: GROUND_RGB[2],
        classification: 2,
      });
    }
  }
  return points;
}

// So the near-clamp dolly step (probeGpuErrors.ts) has geometry in front of
// it: the box straddles the camera's default target [0, 0, 0].
function boxPoints(): ScenePoint[] {
  const points: ScenePoint[] = [];
  const spacingXY = (2 * BOX_HALF_EXTENT_M) / BOX_STEPS;
  const spacingZ = BOX_HEIGHT_M / BOX_STEPS;
  const push = (xM: number, yM: number, zM: number): void => {
    points.push({ xM, yM, zM, r: BOX_RGB[0], g: BOX_RGB[1], b: BOX_RGB[2], classification: 6 });
  };

  for (let i = 0; i <= BOX_STEPS; i++) {
    const along = -BOX_HALF_EXTENT_M + i * spacingXY;
    for (let k = 0; k <= BOX_STEPS; k++) {
      const z = k * spacingZ;
      push(along, -BOX_HALF_EXTENT_M, z);
      push(along, BOX_HALF_EXTENT_M, z);
      push(-BOX_HALF_EXTENT_M, along, z);
      push(BOX_HALF_EXTENT_M, along, z);
    }
  }
  for (let i = 0; i <= BOX_STEPS; i++) {
    const x = -BOX_HALF_EXTENT_M + i * spacingXY;
    for (let j = 0; j <= BOX_STEPS; j++) {
      push(x, -BOX_HALF_EXTENT_M + j * spacingXY, BOX_HEIGHT_M);
    }
  }
  return points;
}

const PROBE_ANCHOR: GroupAnchor = {
  kind: 'geodetic',
  latDeg: 55.6761,
  lonDeg: 12.5683,
  heightMDvr90: 0,
  headingDeg: 0,
};

export function syntheticProbeScene(): GroupRegistryEntry {
  const points = [...groundPoints(), ...boxPoints()];
  const packed = packPoints(points);
  const artifactUrl = URL.createObjectURL(
    // `BlobPart` wants an ArrayBuffer-backed view; `Uint8Array`'s declared
    // `.buffer` is the wider, SharedArrayBuffer-including `ArrayBufferLike`.
    new Blob([packed.buffer as ArrayBuffer], { type: 'application/octet-stream' }),
  );

  const asset: PointCloudAsset = {
    id: 'probe-points',
    label: 'Probe point cloud',
    kind: 'pointCloud',
    pointCount: points.length,
    artifactUrl,
    transform: { translationM: [0, 0, 0], rotation: [0, 0, 0, 1], scale: 1 },
    provenance: {
      source: 'nationalGeodataApi',
      sourceVintage: '2026-01-01',
      pipeline: [{ step: 'syntheticProbeScene', version: '1' }],
    },
  };
  const manifest: SceneManifest = {
    formatVersion: 1,
    groupId: 'probe',
    groupName: 'Probe scene',
    anchor: PROBE_ANCHOR,
    assets: [asset],
  };
  const manifestUrl = URL.createObjectURL(
    new Blob([JSON.stringify(manifest)], { type: 'application/json' }),
  );

  return { id: 'probe', name: 'Probe scene', manifestUrl };
}
