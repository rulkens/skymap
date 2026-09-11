/**
 * syntheticProbeScene — the `?probe` gate's in-tool stand-in for a baked
 * group (mirrors mcpm-workbench's `syntheticCatalog.ts`): a ground plane
 * plus a raised box at ~10k points, a few hundred Gaussian splats above
 * them, and a textured box mesh beside them, all deterministic. Manifest
 * and artifacts ride a `Blob` + `URL.createObjectURL`, so the probe needs
 * no baked data; `resolveAssetUrl.ts` is what lets the resulting blob:
 * URLs through the saga's fetches unprefixed.
 */
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Vec4 } from '../../../../src/@types/math/Vec4';
import { mulberry32 } from '../../../../src/utils/random/mulberry32';
import type { GaussianSplatAsset } from '../../@types/GaussianSplatAsset';
import type { GroupAnchor } from '../../@types/GroupAnchor';
import type { GroupRegistryEntry } from '../../@types/GroupRegistryEntry';
import type { PointCloudAsset } from '../../@types/PointCloudAsset';
import type { SceneManifest } from '../../@types/SceneManifest';
import type { TexturedMeshAsset } from '../../@types/TexturedMeshAsset';
import { packMeshGlb, type TexturedMeshGeometry } from '../../../scene-recon/pack/packMeshGlb';
import { packPoints, type ScenePoint } from '../../../scene-recon/pack/packPoints';
import { packSplats, type GaussianSplatRecord } from '../../../scene-recon/pack/packSplats';

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

const SPLAT_COUNT = 320;
const SPLAT_SEED = 0x5eed;
const SPLAT_HALF_EXTENT_M = 20;
const SPLAT_MIN_HEIGHT_M = 1;
const SPLAT_MAX_HEIGHT_M = 12;

/**
 * Deliberately anisotropic, arbitrarily oriented and visibly coloured: a
 * degenerate covariance or a mis-multiplied rotation basis hides behind
 * axis-aligned unit spheres, and a zero-size quad renders as a clean pass.
 * Rotations use Shoemake's uniform-quaternion construction. `fRest` is
 * populated because the real bake is always shDegree 1: it is the only
 * thing that puts the `sh1` buffer and the two-entry bind group on the
 * probe's path.
 */
function probeSplats(): GaussianSplatRecord[] {
  const rand = mulberry32(SPLAT_SEED);
  const splats: GaussianSplatRecord[] = [];
  for (let i = 0; i < SPLAT_COUNT; i++) {
    const u1 = rand();
    const u2 = 2 * Math.PI * rand();
    const u3 = 2 * Math.PI * rand();
    const rotation: Vec4 = [
      Math.sqrt(1 - u1) * Math.sin(u2),
      Math.sqrt(1 - u1) * Math.cos(u2),
      Math.sqrt(u1) * Math.sin(u3),
      Math.sqrt(u1) * Math.cos(u3),
    ];
    const logScale: Vec3 = [
      Math.log(0.3 + 0.7 * rand()),
      Math.log(0.3 + 0.7 * rand()),
      Math.log(0.3 + 0.7 * rand()),
    ];
    const hue = i / SPLAT_COUNT;
    const channel = (phase: number): number => 128 + 110 * Math.cos(2 * Math.PI * (hue + phase));
    splats.push({
      xM: (2 * rand() - 1) * SPLAT_HALF_EXTENT_M,
      yM: (2 * rand() - 1) * SPLAT_HALF_EXTENT_M,
      zM: SPLAT_MIN_HEIGHT_M + rand() * (SPLAT_MAX_HEIGHT_M - SPLAT_MIN_HEIGHT_M),
      rotation,
      logScale,
      opacity: 0.5 + 0.4 * rand(),
      dcColor: [channel(0), channel(1 / 3), channel(2 / 3)],
      // ±0.125 — a view-dependent tint that shows up without saturating the DC colour.
      fRest: Array.from({ length: 9 }, (_, k) => (k - 4) / 32),
    });
  }
  return splats;
}

const MESH_HALF_EXTENT_M = 3;
const MESH_CENTRE_M: Vec3 = [14, 0, 4]; // clear of the point box, well inside the ground plane

// Signature, IHDR (2x2, 8-bit, colour type 2), IDAT wrapping a zlib stream whose
// one deflate block is STORED, IEND — a 2x2 checker with no encoder on the page.
const MESH_ATLAS_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 2, 0, 0, 0, 2, 8, 2, 0, 0,
  0, 253, 212, 154, 115, 0, 0, 0, 25, 73, 68, 65, 84, 120, 1, 1, 14, 0, 241, 255, 0, 235, 235, 235,
  214, 122, 48, 0, 214, 122, 48, 235, 235, 235, 60, 232, 8, 131, 245, 176, 20, 213, 0, 0, 0, 0, 73,
  69, 78, 68, 174, 66, 96, 130,
]);

/**
 * 24 vertices rather than the 8 the subset also allows: per-face uvs put the
 * whole atlas on every face, so a mis-bound uv buffer or a flipped upload
 * shows as a wrong-coloured face instead of a plausible gradient. Winding is
 * arbitrary — the mesh pipeline runs `cullMode: 'none'` (MVS output is not
 * consistently wound).
 */
function probeMeshGeometry(): TexturedMeshGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const [cx, cy, cz] = MESH_CENTRE_M;
  for (let axis = 0; axis < 3; axis++) {
    for (const side of [-1, 1]) {
      const first = positions.length / 3;
      for (const [u, v] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        const corner: Vec3 = [0, 0, 0];
        corner[axis] = side * MESH_HALF_EXTENT_M;
        corner[(axis + 1) % 3] = (2 * u - 1) * MESH_HALF_EXTENT_M;
        corner[(axis + 2) % 3] = (2 * v - 1) * MESH_HALF_EXTENT_M;
        positions.push(corner[0] + cx, corner[1] + cy, corner[2] + cz);
        uvs.push(u, v);
      }
      indices.push(first, first + 1, first + 2, first + 2, first + 1, first + 3);
    }
  }
  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
    image: { bytes: MESH_ATLAS_PNG, mimeType: 'image/png' },
  };
}

const PROBE_ANCHOR: GroupAnchor = {
  kind: 'geodetic',
  latDeg: 55.6761,
  lonDeg: 12.5683,
  heightMDvr90: 0,
  headingDeg: 0,
};

// The cast is `BlobPart` only accepting ArrayBuffer-backed views while the
// packers' `Uint8Array` is the wider `ArrayBufferLike`; cast the view, never
// `.buffer`, which would drop byteOffset/byteLength.
const artifactBlobUrl = (bytes: Uint8Array): string =>
  URL.createObjectURL(
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }),
  );

export async function syntheticProbeScene(): Promise<GroupRegistryEntry> {
  const points = [...groundPoints(), ...boxPoints()];
  const pointAsset: PointCloudAsset = {
    id: 'probe-points',
    label: 'Probe point cloud',
    kind: 'pointCloud',
    pointCount: points.length,
    artifactUrl: artifactBlobUrl(packPoints(points)),
    transform: { translationM: [0, 0, 0], rotation: [0, 0, 0, 1], scale: 1 },
    provenance: {
      source: 'nationalGeodataApi',
      sourceVintage: '2026-01-01',
      pipeline: [{ step: 'syntheticProbeScene', version: '1' }],
    },
  };

  const splats = probeSplats();
  const splatAsset: GaussianSplatAsset = {
    id: 'probe-splats',
    label: 'Probe splats',
    kind: 'gaussianSplat',
    splatCount: splats.length,
    artifactUrl: artifactBlobUrl(packSplats(splats, 1)),
    transform: { translationM: [0, 0, 0], rotation: [0, 0, 0, 1], scale: 1 },
    provenance: {
      source: 'userPhotoCapture',
      sourceVintage: '2026-01-01',
      pipeline: [{ step: 'syntheticProbeScene', version: '1' }],
    },
  };

  const mesh = probeMeshGeometry();
  const meshAsset: TexturedMeshAsset = {
    id: 'probe-mesh',
    label: 'Probe mesh',
    kind: 'mesh',
    triangleCount: mesh.indices.length / 3,
    artifactUrl: artifactBlobUrl(await packMeshGlb(mesh)),
    transform: { translationM: [0, 0, 0], rotation: [0, 0, 0, 1], scale: 1 },
    provenance: {
      source: 'userPhotoCapture',
      sourceVintage: '2026-01-01',
      pipeline: [{ step: 'syntheticProbeScene', version: '1' }],
    },
  };

  const manifest: SceneManifest = {
    formatVersion: 1,
    groupId: 'probe',
    groupName: 'Probe scene',
    anchor: PROBE_ANCHOR,
    assets: [pointAsset, splatAsset, meshAsset],
  };
  const manifestUrl = URL.createObjectURL(
    new Blob([JSON.stringify(manifest)], { type: 'application/json' }),
  );

  return { id: 'probe', name: 'Probe scene', manifestUrl };
}
