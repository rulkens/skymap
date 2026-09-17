/**
 * Runs against a tmpdir cwd (the CLI's paths are cwd-relative), so this file
 * needs vitest's `forks` pool, as `bakeMesh.test.ts` does.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { cropMesh } from '../../../tools/scene-recon/cropMesh';
import { SOENDERMARKEN } from '../../../tools/scene-recon/groups/soendermarken';
import { packMeshGlb } from '../../../tools/scene-recon/pack/packMeshGlb';
import type { SceneManifest } from '../../../tools/scene-workbench/@types/SceneManifest';
import type { TexturedMeshAsset } from '../../../tools/scene-workbench/@types/TexturedMeshAsset';

const SOURCE: TexturedMeshAsset = {
  kind: 'mesh',
  id: 'mesh',
  label: 'MVS mesh',
  transform: { translationM: [1, 2, 3], rotation: [0, 0, 0, 1], scale: 1 },
  provenance: {
    source: 'nationalGeodataApi',
    sourceVintage: '2019-05-01',
    pipeline: [{ step: 'openmvs', version: 'v2.4.0' }],
  },
  triangleCount: 2,
  artifactUrl: `geo3d/groups/${SOENDERMARKEN.id}/assets/mesh/mesh.glb`,
};

let root: string;
let previousCwd: string;
const manifestPath = () =>
  join(root, 'public/data/geo3d/groups', SOENDERMARKEN.id, 'manifest.json');
const sourceGlbPath = () =>
  join(root, 'public/data/geo3d/groups', SOENDERMARKEN.id, 'assets/mesh/mesh.glb');

beforeAll(async () => {
  previousCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), 'crop-mesh-'));

  mkdirSync(join(sourceGlbPath(), '..'), { recursive: true });
  const jpeg = await sharp({
    create: { width: 1, height: 1, channels: 3, background: { r: 1, g: 2, b: 3 } },
  })
    .jpeg()
    .toBuffer();
  writeFileSync(
    sourceGlbPath(),
    await packMeshGlb({
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 10, 0, 11, 10, 0, 10, 11, 0]),
      uvs: new Float32Array([0, 0, 0.5, 0, 0, 0.5, 0.5, 0.5, 1, 0.5, 0.5, 1]),
      indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
      image: { bytes: jpeg, mimeType: 'image/jpeg' },
    }),
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
  mkdirSync(join(root, 'data/geo3d', SOENDERMARKEN.id), { recursive: true });
  writeFileSync(
    join(root, 'data/geo3d', SOENDERMARKEN.id, 'mesh.outline.json'),
    JSON.stringify({
      formatVersion: 1,
      ringM: [
        [-1, -1],
        [2, -1],
        [2, 2],
        [-1, 2],
      ],
    }),
  );

  process.chdir(root);
});

afterAll(() => {
  process.chdir(previousCwd);
  rmSync(root, { recursive: true, force: true });
});

describe('cropMesh', () => {
  it('cropMesh publishes a sibling asset and leaves the source untouched', async () => {
    const sourceGlb = readFileSync(sourceGlbPath());

    const report = await cropMesh(SOENDERMARKEN, 'mesh');

    const manifest = JSON.parse(readFileSync(manifestPath(), 'utf8')) as SceneManifest;
    expect(manifest.assets.map(({ id }) => id)).toEqual(['mesh', 'mesh-cropped']);
    expect(manifest.assets[0]).toEqual(SOURCE);
    expect(readFileSync(sourceGlbPath())).toEqual(sourceGlb);

    const cropped = manifest.assets[1] as TexturedMeshAsset;
    expect(cropped.triangleCount).toBe(1);
    expect(cropped.transform).toEqual(SOURCE.transform);
    expect(cropped.provenance.pipeline.at(-1)).toEqual({
      step: 'cropMesh',
      version: expect.stringMatching(/^[0-9a-f]{12}$/),
    });
    expect(report.sourceTriangles).toBe(2);
    expect(report.uvCoverage).toBeCloseTo(0.125, 6);
  });
});
