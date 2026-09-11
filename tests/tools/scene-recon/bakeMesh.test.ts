/**
 * The argv lists are the contract: COLMAP 4.x renamed the option groups the
 * CPU-only flags live in, and every OpenMVS stage reads the stem the previous
 * one invented, so a single wrong string turns into a missing-input error an
 * hour into a bake — the stages are asserted verbatim, in order, against
 * stubbed runners (spec §6.2).
 *
 * The bake runs against a tmpdir cwd, so this file needs vitest's `forks` pool
 * (`process.chdir` is undefined under `threads`; `vitest.config.ts` sets no
 * `pool` and v4 defaults to forks).
 */
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Document, WebIO } from '@gltf-transform/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { bakeMesh } from '../../../tools/scene-recon/bakeMesh';
import { SOENDERMARKEN } from '../../../tools/scene-recon/groups/soendermarken';
import { packPoints } from '../../../tools/scene-recon/pack/packPoints';
import { packMeshGlb } from '../../../tools/scene-recon/pack/packMeshGlb';
import { readMeshGlb } from '../../../tools/scene-workbench/src/scene/readMeshGlb';
import type { SceneManifest } from '../../../tools/scene-workbench/@types/SceneManifest';

const ITEM_ID = '2025_84_40_1_0049_00002495_100mm';
const FIXTURE = fileURLToPath(new URL(`../../fixtures/skraafoto/${ITEM_ID}.json`, import.meta.url));

/** A real 1×1 PNG, because the re-pack hands the texture to sharp to encode. */
const PNG_1X1 = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQI12M4kWIEAANWAV85NJsNAAAAAElFTkSuQmCC',
    'base64',
  ),
);

/** A unit cube: 12 triangles, so `triangleCount` has a number to be wrong about. */
function boxGeometry(): Parameters<typeof packMeshGlb>[0] {
  const corners = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ];
  const quads = [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [2, 3, 7, 6],
    [1, 2, 6, 5],
    [3, 0, 4, 7],
  ];
  const indices: number[] = [];
  for (const [a, b, c, d] of quads) indices.push(a!, b!, c!, a!, c!, d!);
  return {
    positions: new Float32Array(corners.flat()),
    uvs: new Float32Array(corners.flatMap(([x, y]) => [x!, y!])),
    indices: new Uint32Array(indices),
    image: { bytes: PNG_1X1, mimeType: 'image/png' },
  };
}

/** SOI + a minimal SOF0 + EOI — `jpegSizePx` walks the header, never decodes. */
function jpegStub(widthPx: number, heightPx: number): Uint8Array {
  const sof = [
    0x00,
    0x11,
    0x08,
    heightPx >> 8,
    heightPx & 0xff,
    widthPx >> 8,
    widthPx & 0xff,
    0x03,
    1,
    0x11,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
  ];
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, ...sof, 0xff, 0xd9]);
}

/** The whole-frame window for the fixture: 20544 × 14016 at the 1920 long edge. */
const FRAME_PX = [1920, 1310] as const;

const RUN_CCT = async (_pipeline: string, lines: readonly string[]) => lines.map(() => '0 0 0 inf');

const COLMAP_ARGV = [
  [
    'feature_extractor',
    '--database_path',
    'database.db',
    '--image_path',
    'sparse-in/images',
    '--ImageReader.camera_model',
    'PINHOLE',
    '--ImageReader.single_camera_per_image',
    '1',
    '--FeatureExtraction.use_gpu',
    '0',
  ],
  ['exhaustive_matcher', '--database_path', 'database.db', '--FeatureMatching.use_gpu', '0'],
  [
    'point_triangulator',
    '--database_path',
    'database.db',
    '--image_path',
    'sparse-in/images',
    '--input_path',
    'sparse-in',
    '--output_path',
    'sparse',
  ],
  [
    'image_undistorter',
    '--image_path',
    'sparse-in/images',
    '--input_path',
    'sparse',
    '--output_path',
    'dense',
    '--output_type',
    'COLMAP',
  ],
];

let root: string;
let previousCwd: string;
let workDir: string;
let assetDir: string;

beforeAll(() => {
  previousCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), 'bake-mesh-'));

  const collectionDir = join(root, 'data/raw/skraafoto', SOENDERMARKEN.skraafoto.collection);
  mkdirSync(collectionDir, { recursive: true });
  copyFileSync(FIXTURE, join(collectionDir, `${ITEM_ID}.json`));
  writeFileSync(join(collectionDir, `${ITEM_ID}.jpg`), jpegStub(...FRAME_PX));
  workDir = join(collectionDir, `mvs-${SOENDERMARKEN.id}`);
  mkdirSync(workDir, { recursive: true });

  const lidarDir = join(root, 'public/data/geo3d/groups', SOENDERMARKEN.id, 'assets/lidar');
  mkdirSync(lidarDir, { recursive: true });
  writeFileSync(
    join(lidarDir, 'points.bin'),
    packPoints([{ xM: 0, yM: 0, zM: 0, r: 1, g: 2, b: 3, classification: 2 }]),
  );
  assetDir = join(root, 'public/data/geo3d/groups', SOENDERMARKEN.id, 'assets/mesh');

  process.chdir(root);
});

afterAll(() => {
  process.chdir(previousCwd);
  rmSync(root, { recursive: true, force: true });
});

/** Every runner call as `[tool, ...args]`, so stage order across the two
 *  toolchains is one sequence rather than two independent ones. */
let calls: string[][];

beforeEach(() => {
  calls = [];
  rmSync(join(root, 'public/data/geo3d/groups', SOENDERMARKEN.id, 'manifest.json'), {
    force: true,
  });
});

/** Stands in for OpenMVS: records the call and, at the texture stage, writes
 *  the GLB that stage would export beside its input. */
function fakeOpenMvs(glb: () => Promise<Uint8Array>) {
  return async (tool: string, args: readonly string[]): Promise<void> => {
    calls.push([tool, ...args]);
    if (tool !== 'TextureMesh') return;
    const stem = args[0]!.replace(/\.mvs$/, '');
    writeFileSync(join(workDir, `${stem}_texture.glb`), await glb());
  };
}

const DEPS = (glb: () => Promise<Uint8Array>) => ({
  runCct: RUN_CCT,
  runColmap: async (args: readonly string[]) => {
    calls.push(['colmap', ...args]);
  },
  runOpenMvs: fakeOpenMvs(glb),
  colmapVersion: () => 'COLMAP 4.2.0 (test)',
  openMvsVersion: () => 'OpenMVS x64 v2.4.0',
});

const boxGlb = () => packMeshGlb(boxGeometry());

describe('bakeMesh', () => {
  it('runs the COLMAP and OpenMVS stages in order with the pinned flags', async () => {
    await bakeMesh(SOENDERMARKEN, DEPS(boxGlb));

    expect(calls).toEqual([
      ...COLMAP_ARGV.map((args) => ['colmap', ...args]),
      ['InterfaceCOLMAP', '-i', 'dense', '-o', 'scene.mvs', '--image-folder', 'dense/images'],
      ['DensifyPointCloud', 'scene.mvs', '--resolution-level', '1', '--number-views', '0'],
      ['ReconstructMesh', 'scene_dense.mvs'],
      ['TextureMesh', 'scene_dense_mesh.mvs', '--export-type', 'glb', '--max-texture-size', '8192'],
    ]);
  });

  it('--full-res selects resolution level 0', async () => {
    await bakeMesh(SOENDERMARKEN, DEPS(boxGlb), { fullRes: true });

    expect(calls).toContainEqual([
      'DensifyPointCloud',
      'scene.mvs',
      '--resolution-level',
      '0',
      '--number-views',
      '0',
    ]);
  });

  it('--refine inserts RefineMesh and textures its output', async () => {
    await bakeMesh(SOENDERMARKEN, DEPS(boxGlb), { refine: true });

    expect(calls.slice(-2)).toEqual([
      ['RefineMesh', 'scene_dense_mesh.mvs', '--resolution-level', '1'],
      [
        'TextureMesh',
        'scene_dense_mesh_refine.mvs',
        '--export-type',
        'glb',
        '--max-texture-size',
        '8192',
      ],
    ]);
  });

  it('--reuse-glb runs no runner and keeps the manifest’s version stamps', async () => {
    writeFileSync(join(workDir, 'scene_dense_mesh_texture.glb'), await boxGlb());
    writeFileSync(
      join(root, 'public/data/geo3d/groups', SOENDERMARKEN.id, 'manifest.json'),
      JSON.stringify({
        formatVersion: 1,
        groupId: SOENDERMARKEN.id,
        groupName: SOENDERMARKEN.name,
        anchor: SOENDERMARKEN.anchor,
        assets: [
          {
            kind: 'mesh',
            id: 'mesh',
            label: 'a previous bake',
            transform: { translationM: [0, 0, 0], rotation: [0, 0, 0, 1], scale: 1 },
            provenance: {
              source: 'nationalGeodataApi',
              sourceVintage: '2025-04-27',
              pipeline: [
                { step: 'colmap', version: 'a.b.c' },
                { step: 'openmvs', version: 'x.y.z' },
              ],
            },
            triangleCount: 3,
            artifactUrl: `geo3d/groups/${SOENDERMARKEN.id}/assets/mesh/mesh.glb`,
          },
        ],
      } satisfies SceneManifest),
    );

    const asset = await bakeMesh(
      SOENDERMARKEN,
      {
        ...DEPS(async () => {
          throw new Error('TextureMesh must not run under reuseGlb');
        }),
        colmapVersion: () => 'installed-9.9.9',
        openMvsVersion: () => 'installed-9.9.9',
      },
      { reuseGlb: true },
    );

    expect(calls).toEqual([]);
    // The stamps name what reconstructed the geometry, never what happens to
    // be installed when it is re-packed.
    expect(asset.provenance.pipeline).toContainEqual({ step: 'openmvs', version: 'x.y.z' });
    expect(asset.provenance.pipeline).toContainEqual({ step: 'colmap', version: 'a.b.c' });
  });

  it('a two-texture OpenMVS export fails the bake naming --max-texture-size', async () => {
    const split = async (): Promise<Uint8Array> => {
      const doc = await new WebIO().readBinary(await boxGlb());
      splitMaterial(doc);
      return new WebIO().writeBinary(doc);
    };

    await expect(bakeMesh(SOENDERMARKEN, DEPS(split))).rejects.toThrow(/--max-texture-size/);
  });

  it('the published asset’s triangleCount matches the exported geometry', async () => {
    const asset = await bakeMesh(SOENDERMARKEN, DEPS(boxGlb));

    expect(asset.triangleCount).toBe(12);
    expect(asset.artifactUrl).toBe(`geo3d/groups/${SOENDERMARKEN.id}/assets/mesh/mesh.glb`);

    const shipped = await readFile(join(assetDir, 'mesh.glb'));
    const geometry = await readMeshGlb(
      shipped.buffer.slice(shipped.byteOffset, shipped.byteOffset + shipped.byteLength),
    );
    expect(geometry.indices.length).toBe(36);
    // The re-pack re-encodes OpenMVS's PNG atlas, which is 4-10x larger.
    expect(geometry.image.mimeType).toBe('image/jpeg');
  });
});

/** What a `--max-texture-size` overflow leaves behind: a second texture on the
 *  one material (`packMeshGlb.test.ts` uses the same stand-in). */
function splitMaterial(doc: Document): void {
  const material = doc.getRoot().listMaterials()[0]!;
  material.setEmissiveTexture(doc.getRoot().listTextures()[0]!.clone());
}
