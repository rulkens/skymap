/**
 * The argv lists are the contract: every OpenMVS stage names its output after
 * its *input's* stem unless `-o` pins it, and `--image-folder` is resolved
 * against `-i` — so a single wrong string turns into a missing-input error an
 * hour into a bake. The stages are asserted verbatim, in order, against
 * stubbed runners (spec §6.2).
 *
 * The bake runs against a tmpdir cwd, so this file needs vitest's `forks` pool
 * (`process.chdir` is undefined under `threads`; `vitest.config.ts` sets no
 * `pool` and v4 defaults to forks).
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Document, WebIO } from '@gltf-transform/core';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { bakeMesh } from '../../../tools/scene-recon/bakeMesh';
import { SOENDERMARKEN } from '../../../tools/scene-recon/groups/soendermarken';
import { packPoints } from '../../../tools/scene-recon/pack/packPoints';
import { packMeshGlb } from '../../../tools/scene-recon/pack/packMeshGlb';
import { readMeshGlb } from '../../../tools/scene-workbench/src/scene/readMeshGlb';
import type { SceneManifest } from '../../../tools/scene-workbench/@types/SceneManifest';

const ITEM_ID = '2025_84_40_1_0049_00002495_100mm';
/** A second harvested frame, staged as a CMYK JPEG: 19 of the real 2025 nadir
 *  frames are, and OpenCV refuses those outright (spec §6.2). */
const CMYK_ITEM_ID = '2025_84_40_1_0049_00002496_100mm';
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

/**
 * OpenMVS's export shape: the atlas is a sidecar PNG the GLB names by URI, not
 * an embedded bufferView. gltf-transform's writers always embed, so the
 * container is patched by hand — one `{ uri }` image per texture.
 */
function withSidecarTextures(glb: Uint8Array, stem: string): [Uint8Array, string[]] {
  const header = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = header.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))) as {
    images: unknown[];
  };
  const sidecars = json.images.map((_, i) => `${stem}_${i}.png`);
  json.images = sidecars.map((uri) => ({ uri }));

  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const padded = new Uint8Array(Math.ceil(encoded.length / 4) * 4).fill(0x20);
  padded.set(encoded);

  const rest = glb.subarray(20 + jsonLength); // the BIN chunk, unchanged
  const out = new Uint8Array(20 + padded.length + rest.length);
  out.set(glb.subarray(0, 20));
  out.set(padded, 20);
  out.set(rest, 20 + padded.length);
  const view = new DataView(out.buffer);
  view.setUint32(8, out.length, true);
  view.setUint32(12, padded.length, true);
  return [out, sidecars];
}

/** The whole-frame window for the fixture: 20544 × 14016 at the 1920 long edge. */
const FRAME_PX = { width: 1920, height: 1310 } as const;

const RUN_CCT = async (_pipeline: string, lines: readonly string[]) => lines.map(() => '0 0 0 inf');

let root: string;
let previousCwd: string;
let collectionDir: string;
let workDir: string;
let assetDir: string;

beforeAll(async () => {
  previousCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), 'bake-mesh-'));

  collectionDir = join(root, 'data/raw/skraafoto', SOENDERMARKEN.skraafoto.collection);
  mkdirSync(collectionDir, { recursive: true });
  const item = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { id: string };
  writeFileSync(join(collectionDir, `${ITEM_ID}.json`), JSON.stringify(item));
  writeFileSync(
    join(collectionDir, `${CMYK_ITEM_ID}.json`),
    JSON.stringify({ ...item, id: CMYK_ITEM_ID }),
  );
  // Real JPEGs, not header stubs: the staging step reads every frame with sharp.
  const canvas = { ...FRAME_PX, background: { r: 90, g: 120, b: 60, alpha: 1 } };
  writeFileSync(
    join(collectionDir, `${ITEM_ID}.jpg`),
    await sharp({ create: { ...canvas, channels: 3 } })
      .jpeg()
      .toBuffer(),
  );
  writeFileSync(
    join(collectionDir, `${CMYK_ITEM_ID}.jpg`),
    await sharp({ create: { ...canvas, channels: 4 } })
      .toColourspace('cmyk')
      .jpeg()
      .toBuffer(),
  );
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

/** A depth-map cache from a previous run, and whether it outlived the clear. */
const STALE_DMAP = 'depth0000.dmap';
let staleDmapAtDensify: boolean | undefined;

beforeEach(() => {
  calls = [];
  staleDmapAtDensify = undefined;
  writeFileSync(join(workDir, STALE_DMAP), 'a previous run’s depth map');
  rmSync(join(root, 'public/data/geo3d/groups', SOENDERMARKEN.id, 'manifest.json'), {
    force: true,
  });
});

/** Stands in for OpenMVS: records the call and, at the texture stage, writes
 *  the GLB + sidecar atlas that stage would export under its pinned `-o`. */
function fakeOpenMvs(glb: () => Promise<Uint8Array>) {
  return async (tool: string, args: readonly string[]): Promise<void> => {
    calls.push([tool, ...args]);
    if (tool === 'DensifyPointCloud') {
      staleDmapAtDensify = existsSync(join(workDir, STALE_DMAP));
    }
    if (tool !== 'TextureMesh') return;
    const out = args[args.indexOf('-o') + 1]!;
    const [bytes, sidecars] = withSidecarTextures(await glb(), out.replace(/\.glb$/, ''));
    for (const sidecar of sidecars) writeFileSync(join(workDir, sidecar), PNG_1X1);
    writeFileSync(join(workDir, out), bytes);
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

const DENSIFY_ARGV = [
  'DensifyPointCloud',
  'scene.mvs',
  '--resolution-level',
  '1',
  '--number-views',
  '0',
  '--remove-dmaps',
  '1',
];

const TEXTURE_MESH_ARGV = [
  'TextureMesh',
  'scene_dense.mvs',
  '--mesh-file',
  'scene_dense_mesh.ply',
  '--export-type',
  'glb',
  '--max-texture-size',
  '8192',
  '-o',
  'scene_dense_texture.glb',
];

describe('bakeMesh', () => {
  it('runs the COLMAP and OpenMVS stages in order with the pinned flags', async () => {
    await bakeMesh(SOENDERMARKEN, DEPS(boxGlb));

    expect(calls).toEqual([
      [
        'colmap',
        'image_undistorter',
        '--image_path',
        'sparse-in/images',
        '--input_path',
        'sparse-in',
        '--output_path',
        'dense',
        '--output_type',
        'COLMAP',
      ],
      ['InterfaceCOLMAP', '-i', 'dense', '-o', 'scene.mvs', '--image-folder', 'images'],
      DENSIFY_ARGV,
      ['ReconstructMesh', 'scene_dense.mvs'],
      TEXTURE_MESH_ARGV,
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
      '--remove-dmaps',
      '1',
    ]);
  });

  it('--refine inserts RefineMesh and textures its output', async () => {
    await bakeMesh(SOENDERMARKEN, DEPS(boxGlb), { refine: true });

    expect(calls.slice(-2)).toEqual([
      [
        'RefineMesh',
        'scene_dense.mvs',
        '--mesh-file',
        'scene_dense_mesh.ply',
        '--resolution-level',
        '1',
        '-o',
        'scene_dense_mesh_refine.ply',
      ],
      TEXTURE_MESH_ARGV.map((arg) =>
        arg === 'scene_dense_mesh.ply' ? 'scene_dense_mesh_refine.ply' : arg,
      ),
    ]);
  });

  it('clears OpenMVS’s depth-map cache before densifying', async () => {
    await bakeMesh(SOENDERMARKEN, DEPS(boxGlb));

    // The caches are keyed by image index, so a stale one is silently fed to
    // whatever frame now holds that index — bake #2 aborted mid-fusion on it.
    expect(staleDmapAtDensify).toBe(false);
  });

  it('re-encodes the staged CMYK frames and leaves the sRGB ones byte-identical', async () => {
    await bakeMesh(SOENDERMARKEN, DEPS(boxGlb));

    const staged = (id: string) => readFileSync(join(workDir, 'sparse-in/images', `${id}.jpg`));
    expect(await sharp(staged(CMYK_ITEM_ID)).metadata()).toMatchObject({
      channels: 3,
      space: 'srgb',
    });
    expect(staged(ITEM_ID)).toEqual(readFileSync(join(collectionDir, `${ITEM_ID}.jpg`)));
  });

  it('--reuse-glb runs no runner and keeps the manifest’s version stamps', async () => {
    const [bytes, sidecars] = withSidecarTextures(await boxGlb(), 'scene_dense_texture');
    for (const sidecar of sidecars) writeFileSync(join(workDir, sidecar), PNG_1X1);
    writeFileSync(join(workDir, 'scene_dense_texture.glb'), bytes);
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
    // The re-pack re-encodes OpenMVS's sidecar PNG atlas, which is 4-10x larger.
    expect(geometry.image.mimeType).toBe('image/jpeg');
  });
});

/** What a `--max-texture-size` overflow leaves behind: a second texture on the
 *  one material (`packMeshGlb.test.ts` uses the same stand-in). */
function splitMaterial(doc: Document): void {
  const material = doc.getRoot().listMaterials()[0]!;
  material.setEmissiveTexture(doc.getRoot().listTextures()[0]!.clone());
}
