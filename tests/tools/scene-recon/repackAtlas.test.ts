/**
 * Runs against a tmpdir cwd (the CLI's paths are cwd-relative), so this file
 * needs vitest's `forks` pool, as `cropMesh.test.ts` does. The source atlas is
 * three flat-coloured 64x64 squares (three real charts) plus a fourth colour
 * sampled only by a degenerate face whose three UVs coincide — xatlas's
 * "no camera saw this face" case `paintOrphanBlocks` exists for.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { meshGlbGeometry } from '../../../tools/scene-recon/pack/meshGlbGeometry';
import { packMeshGlb } from '../../../tools/scene-recon/pack/packMeshGlb';
import { SOENDERMARKEN } from '../../../tools/scene-recon/groups/soendermarken';
import { repackAtlas } from '../../../tools/scene-recon/repackAtlas';
import type { SceneManifest } from '../../../tools/scene-workbench/@types/SceneManifest';
import type { TexturedMeshAsset } from '../../../tools/scene-workbench/@types/TexturedMeshAsset';

const SOURCE_SIZE_PX = 256;
const BLOCK_PX = 64;
const DEST_SIZE_PX = 2048;

// Three real charts (index 0-2) plus a fourth colour the degenerate face samples.
const COLORS: readonly (readonly [number, number, number])[] = [
  [220, 40, 40],
  [40, 200, 60],
  [40, 80, 220],
  [230, 210, 40],
];

function buildSourceRgb(): Buffer {
  const rgb = Buffer.alloc(SOURCE_SIZE_PX * SOURCE_SIZE_PX * 3, 128);
  for (let block = 0; block < COLORS.length; block++) {
    const [r, g, b] = COLORS[block]!;
    const x0 = block * BLOCK_PX;
    for (let y = 0; y < BLOCK_PX; y++) {
      for (let x = 0; x < BLOCK_PX; x++) {
        const i = (y * SOURCE_SIZE_PX + (x0 + x)) * 3;
        rgb[i] = r;
        rgb[i + 1] = g;
        rgb[i + 2] = b;
      }
    }
  }
  return rgb;
}

/** Chart k's quad sits over source block k, at UV-matching pixel positions;
 *  each chart's positions live in their own x-band so a published triangle's
 *  origin is recoverable from its (preserved-verbatim) positions alone. */
function buildGeometry(): {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
} {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let chart = 0; chart < 3; chart++) {
    const base = positions.length / 3;
    const u0 = (chart * BLOCK_PX) / SOURCE_SIZE_PX;
    const u1 = ((chart + 1) * BLOCK_PX) / SOURCE_SIZE_PX;
    const v0 = 0;
    const v1 = BLOCK_PX / SOURCE_SIZE_PX;
    const x0 = chart * 2;
    positions.push(x0, 0, 0, x0 + 1, 0, 0, x0 + 1, 1, 0, x0, 1, 0);
    uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  // Degenerate face: three coincident UVs inside block 3, three distinct positions
  // far from every real chart's x-band so its output triangle is unambiguous.
  const degenerateBase = positions.length / 3;
  const degenerateU = (3 * BLOCK_PX + BLOCK_PX / 2) / SOURCE_SIZE_PX;
  const degenerateV = BLOCK_PX / 2 / SOURCE_SIZE_PX;
  positions.push(10, 0, 0, 10, 1, 0, 11, 0, 0);
  uvs.push(degenerateU, degenerateV, degenerateU, degenerateV, degenerateU, degenerateV);
  indices.push(degenerateBase, degenerateBase + 1, degenerateBase + 2);

  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

const SOURCE_GEOMETRY = buildGeometry();
const SOURCE_TRIANGLE_COUNT = SOURCE_GEOMETRY.indices.length / 3;

const SOURCE: TexturedMeshAsset = {
  kind: 'mesh',
  id: 'mesh',
  label: 'MVS mesh',
  transform: { translationM: [0, 0, 0], rotation: [0, 0, 0, 1], scale: 1 },
  provenance: {
    source: 'nationalGeodataApi',
    sourceVintage: '2019-05-01',
    pipeline: [{ step: 'openmvs', version: 'v2.4.0' }],
  },
  triangleCount: SOURCE_TRIANGLE_COUNT,
  artifactUrl: `geo3d/groups/${SOENDERMARKEN.id}/assets/mesh/mesh.glb`,
};

let root: string;
let previousCwd: string;
const manifestPath = () =>
  join(root, 'public/data/geo3d/groups', SOENDERMARKEN.id, 'manifest.json');
const assetGlbPath = (assetId: string) =>
  join(root, 'public/data/geo3d/groups', SOENDERMARKEN.id, 'assets', assetId, 'mesh.glb');

beforeAll(async () => {
  previousCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), 'repack-atlas-'));

  mkdirSync(join(assetGlbPath('mesh'), '..'), { recursive: true });
  const jpeg = await sharp(buildSourceRgb(), {
    raw: { width: SOURCE_SIZE_PX, height: SOURCE_SIZE_PX, channels: 3 },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
  writeFileSync(
    assetGlbPath('mesh'),
    await packMeshGlb({ ...SOURCE_GEOMETRY, image: { bytes: jpeg, mimeType: 'image/jpeg' } }),
  );
  writeFileSync(
    manifestPath(),
    JSON.stringify({
      formatVersion: 1,
      groupId: SOENDERMARKEN.id,
      groupName: SOENDERMARKEN.name,
      anchor: SOENDERMARKEN.anchor,
      assets: [SOURCE],
    } satisfies SceneManifest),
  );

  process.chdir(root);
});

afterAll(() => {
  process.chdir(previousCwd);
  rmSync(root, { recursive: true, force: true });
});

/** Which source colour a published triangle came from, read off its (verbatim,
 *  xref-gathered) positions rather than any xatlas bookkeeping — chart k's band
 *  is x in [2k, 2k+1], the degenerate face's is x in [10, 11]. */
function colorIndexForTriangleCentroidX(x: number): number {
  if (x < 1.5) return 0;
  if (x < 3.5) return 1;
  if (x < 5.5) return 2;
  return 3;
}

// dilateAtlas's 16 passes over a mostly-empty 2048² atlas (the size DoD ships) take a few
// seconds in plain JS — the price of testing what ships, not a hung test.
const REPACK_TIMEOUT_MS = 30_000;

describe('repackAtlas', () => {
  it(
    'publishes a sibling whose charts carry the source colours',
    async () => {
      const report = await repackAtlas(SOENDERMARKEN, 'mesh', DEST_SIZE_PX);
      expect(report.scale).toBe(1);

      const published = meshGlbGeometry(await new NodeIO().read(assetGlbPath('mesh-2k')));
      const { data: atlasRgb } = await sharp(published.image.bytes)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      for (let t = 0; t < published.indices.length; t += 3) {
        const ia = published.indices[t]!;
        const ib = published.indices[t + 1]!;
        const ic = published.indices[t + 2]!;
        const centroidX =
          (published.positions[3 * ia]! +
            published.positions[3 * ib]! +
            published.positions[3 * ic]!) /
          3;
        const [er, eg, eb] = COLORS[colorIndexForTriangleCentroidX(centroidX)]!;

        const centroidU =
          (published.uvs[2 * ia]! + published.uvs[2 * ib]! + published.uvs[2 * ic]!) / 3;
        const centroidV =
          (published.uvs[2 * ia + 1]! + published.uvs[2 * ib + 1]! + published.uvs[2 * ic + 1]!) /
          3;
        const sx = Math.min(DEST_SIZE_PX - 1, Math.max(0, Math.floor(centroidU * DEST_SIZE_PX)));
        const sy = Math.min(DEST_SIZE_PX - 1, Math.max(0, Math.floor(centroidV * DEST_SIZE_PX)));
        const i = (sy * DEST_SIZE_PX + sx) * 3;

        expect(Math.abs(atlasRgb[i]! - er)).toBeLessThanOrEqual(6);
        expect(Math.abs(atlasRgb[i + 1]! - eg)).toBeLessThanOrEqual(6);
        expect(Math.abs(atlasRgb[i + 2]! - eb)).toBeLessThanOrEqual(6);
      }
    },
    REPACK_TIMEOUT_MS,
  );

  it(
    'keeps every triangle, including the degenerate one',
    async () => {
      const report = await repackAtlas(SOENDERMARKEN, 'mesh', DEST_SIZE_PX);
      expect(report.asset.triangleCount).toBe(SOURCE_TRIANGLE_COUNT);

      const published = meshGlbGeometry(await new NodeIO().read(assetGlbPath('mesh-2k')));
      let foundDegenerate = false;
      for (let t = 0; t < published.indices.length; t += 3) {
        const ia = published.indices[t]!;
        const ib = published.indices[t + 1]!;
        const ic = published.indices[t + 2]!;
        const centroidX =
          (published.positions[3 * ia]! +
            published.positions[3 * ib]! +
            published.positions[3 * ic]!) /
          3;
        if (colorIndexForTriangleCentroidX(centroidX) !== 3) continue;

        foundDegenerate = true;
        const ua = [published.uvs[2 * ia]!, published.uvs[2 * ia + 1]!];
        const ub = [published.uvs[2 * ib]!, published.uvs[2 * ib + 1]!];
        const uc = [published.uvs[2 * ic]!, published.uvs[2 * ic + 1]!];
        expect(ua).toEqual(ub);
        expect(ub).toEqual(uc);

        const { data: atlasRgb } = await sharp(published.image.bytes)
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const sx = Math.min(DEST_SIZE_PX - 1, Math.max(0, Math.floor(ua[0]! * DEST_SIZE_PX)));
        const sy = Math.min(DEST_SIZE_PX - 1, Math.max(0, Math.floor(ua[1]! * DEST_SIZE_PX)));
        const i = (sy * DEST_SIZE_PX + sx) * 3;
        const [er, eg, eb] = COLORS[3]!;
        expect(Math.abs(atlasRgb[i]! - er)).toBeLessThanOrEqual(6);
        expect(Math.abs(atlasRgb[i + 1]! - eg)).toBeLessThanOrEqual(6);
        expect(Math.abs(atlasRgb[i + 2]! - eb)).toBeLessThanOrEqual(6);
      }
      expect(foundDegenerate).toBe(true);
    },
    REPACK_TIMEOUT_MS,
  );

  it(
    'records the pack in provenance',
    async () => {
      await repackAtlas(SOENDERMARKEN, 'mesh', DEST_SIZE_PX);

      const manifest = JSON.parse(readFileSync(manifestPath(), 'utf8')) as SceneManifest;
      expect(manifest.assets.map(({ id }) => id)).toEqual(['mesh', 'mesh-2k']);
      expect(manifest.assets[0]).toEqual(SOURCE);

      const asset = manifest.assets[1] as TexturedMeshAsset;
      expect(asset.label).toBe(`${SOURCE.label} — 2K atlas`);
      expect(asset.provenance.pipeline.at(-1)!.step).toBe('repackAtlas');
      expect(asset.provenance.pipeline.at(-1)!.version).toMatch(
        /^2048@1\.000 xatlas-wasm@\d+\.\d+\.\d+ q90$/,
      );
    },
    REPACK_TIMEOUT_MS,
  );
});
