#!/usr/bin/env node
/**
 * bakeMesh — one scene group's textured MVS mesh (`--group <id>`): the LiDAR
 * cloud projected into the known poses *is* the sparse model, so COLMAP never
 * matches a feature and only lays the workspace out for OpenMVS, which then
 * densifies, meshes, refines, textures it into a re-packed `mesh.glb` + the
 * manifest (spec §6.2). Both OpenMVS stages that write a file get an explicit
 * `-o`: v2.4.0 names an output after its *input's* stem, so RefineMesh would
 * otherwise move the GLB the re-pack reads. The runners are injected so a
 * re-pack runs with neither toolchain installed; `main()` wires the real ones.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';

import { sceneGroupFromArgv } from './groups/sceneGroupFromArgv';
import { groupPhotoPoses } from './poses/groupPhotoPoses';
import { spawnCct } from './poses/spawnCct';
import { meshGlbGeometry } from './pack/meshGlbGeometry';
import { packMeshGlb } from './pack/packMeshGlb';
import { writeColmapModel } from './splats/writeColmapModel';
import { assetArtifactUrl, groupAssetDir, groupManifestPath } from './manifest/geo3dLayout';
import { publishAsset } from './manifest/publishAsset';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { readStacItems } from '../utils/skraafoto/readStacItems';
import { skraafotoHarvestDir } from '../utils/skraafoto/skraafotoHarvestDir';
import type { CctRunner } from './poses/topocentricPositionsM';
import type { SceneGroupDefinition } from './@types/SceneGroupDefinition';
import type { SkraafotoStacItem } from './@types/SkraafotoStacItem';
import type { SceneManifest } from '../scene-workbench/@types/SceneManifest';
import type { TexturedMeshAsset } from '../scene-workbench/@types/TexturedMeshAsset';

type ColmapRunner = (args: readonly string[]) => Promise<void>;
type OpenMvsRunner = (tool: string, args: readonly string[]) => Promise<void>;
type GdalRunner = (args: readonly string[]) => Promise<void>;

/** Stable across re-runs, so a re-bake upserts the one asset. */
const ASSET_ID = 'mesh';
/** `bakeLidar.ts`'s asset id — its `points.bin` is this bake's sparse model. */
const LIDAR_ASSET_ID = 'lidar';
const POINT_SAMPLE_TARGET = 200_000;
/** The atlas ceiling: past it TextureMesh splits the mesh across materials,
 *  which `meshGlbGeometry` refuses. */
const MAX_TEXTURE_PX = 8192;

/** libjpeg tags the four components `gdal_translate` wrote from the 4-band COG
 *  as CMYK, but they are raw R,G,B + a fourth band: converting the "CMYK" to
 *  sRGB (what sharp would do) muddies the frame. Take the first three
 *  components as they are. */
const GDAL_RGB_ARGV = [
  '--config',
  'GDAL_JPEG_TO_RGB',
  'NO',
  '--config',
  'GDAL_PAM_ENABLED',
  'NO',
  '-b',
  '1',
  '-b',
  '2',
  '-b',
  '3',
  '-of',
  'JPEG',
  '-co',
  'QUALITY=95',
];

const MESH_PLY = 'scene_dense_mesh.ply';
const REFINED_PLY = 'scene_dense_mesh_refine.ply';
const TEXTURED_GLB = 'scene_dense_texture.glb';

type Stage = {
  readonly tool: string;
  readonly args: readonly string[];
  readonly output: string;
};

/** The workdir every stage runs in, `bakeMesh`'s and `main()`'s runners alike. */
function meshWorkDir(group: SceneGroupDefinition): string {
  return join(skraafotoHarvestDir(rawDataPath('skraafoto.dir'), group), `mvs-${group.id}`);
}

function bakeStages(): readonly Stage[] {
  return [
    {
      tool: 'colmap',
      output: 'dense',
      args: [
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
    },
    {
      tool: 'InterfaceCOLMAP',
      output: 'scene.mvs',
      // `--image-folder` is resolved against `-i`, so an absolute-looking
      // `dense/images` here becomes `dense/dense/images`.
      args: ['-i', 'dense', '-o', 'scene.mvs', '--image-folder', 'images'],
    },
    {
      tool: 'DensifyPointCloud',
      output: 'scene_dense.mvs',
      args: ['scene.mvs', '--resolution-level', '0', '--number-views', '0', '--remove-dmaps', '1'],
    },
    { tool: 'ReconstructMesh', output: MESH_PLY, args: ['scene_dense.mvs'] },
    {
      tool: 'RefineMesh',
      output: REFINED_PLY,
      args: [
        'scene_dense.mvs',
        '--mesh-file',
        MESH_PLY,
        '--resolution-level',
        '1',
        '-o',
        REFINED_PLY,
      ],
    },
    {
      tool: 'TextureMesh',
      output: TEXTURED_GLB,
      // Seam levelling off, both passes: on this scene it clips every patch
      // interior to an RGB-cube corner and leaves photo pixels only in the
      // margins. Global-off-local-on still clips, so neither comes back for
      // nicer seams without a re-texture proving otherwise.
      // `--empty-color` 0x404040: faces no view covers default to orange
      // (0xFF7F27), which reads as data beside the LiDAR and splat layers.
      args: [
        'scene_dense.mvs',
        '--mesh-file',
        REFINED_PLY,
        '--export-type',
        'glb',
        '--max-texture-size',
        String(MAX_TEXTURE_PX),
        '--global-seam-leveling',
        '0',
        '--local-seam-leveling',
        '0',
        '--empty-color',
        '4210752',
        '-o',
        TEXTURED_GLB,
      ],
    },
  ];
}

export async function bakeMesh(
  group: SceneGroupDefinition,
  deps: {
    readonly runCct: CctRunner;
    readonly runColmap: ColmapRunner;
    readonly runOpenMvs: OpenMvsRunner;
    readonly runGdal: GdalRunner;
    readonly colmapVersion: () => string;
    readonly openMvsVersion: () => string;
  },
  /** `reuseGlb`: re-pack the last run's OpenMVS export instead of reconstructing
   *  again, carrying the manifest's stamps so the asset never credits its
   *  geometry to whatever version happens to be installed (`--reuse-ply`'s
   *  contract, `bakeSplats.ts`). */
  options: { readonly reuseGlb?: boolean } = {},
): Promise<TexturedMeshAsset> {
  const pointsBinPath = join(groupAssetDir(group.id, LIDAR_ASSET_ID), 'points.bin');
  if (!existsSync(pointsBinPath)) {
    throw new Error(
      `bakeMesh: no LiDAR seed at ${pointsBinPath} — run \`npm run bake-lidar\` first; ` +
        "it is the reconstruction's entire sparse model.",
    );
  }

  const workDir = meshWorkDir(group);
  const manifestPath = groupManifestPath(group.id);
  const glbPath = join(workDir, TEXTURED_GLB);

  let colmapVersion: string;
  let openMvsVersion: string;
  let items: readonly SkraafotoStacItem[];
  if (options.reuseGlb) {
    if (!existsSync(glbPath)) {
      throw new Error(`bakeMesh: --reuse-glb, but no export at ${glbPath} to pack.`);
    }
    // Lazy fallback only, so a re-pack works with neither toolchain installed.
    colmapVersion = (await manifestStepVersion(manifestPath, 'colmap')) ?? deps.colmapVersion();
    openMvsVersion = (await manifestStepVersion(manifestPath, 'openmvs')) ?? deps.openMvsVersion();
    // The reuse path derives no poses, so it reads the harvest purely to date
    // the asset below — and `groupPhotoPoses` is not there to catch an empty one.
    const harvestDir = skraafotoHarvestDir(rawDataPath('skraafoto.dir'), group);
    items = await readStacItems(harvestDir);
    if (items.length === 0) {
      throw new Error(
        `scene-recon: no STAC items in ${harvestDir} — run ` +
          `\`npm run fetch-skraafoto -- --group ${group.id}\` first.`,
      );
    }
  } else {
    // Probed before the staging below copies every frame's JPEG, so a missing
    // binary costs a second rather than the whole copy.
    colmapVersion = deps.colmapVersion();
    openMvsVersion = deps.openMvsVersion();

    const harvest = await groupPhotoPoses(group, { runCct: deps.runCct });
    items = harvest.items;

    // Cleared, not overwritten: a frame the group's bounds no longer see is
    // dropped from the model but its staged JPEG would survive, and the
    // undistorter reconstructs from the directory rather than from images.txt.
    const sparseIn = join(workDir, 'sparse-in');
    await rm(sparseIn, { recursive: true, force: true });
    await writeColmapModel({
      poses: harvest.poses,
      pointsBinPath,
      pointSampleTarget: POINT_SAMPLE_TARGET,
      outDir: sparseIn,
      observations: true,
    });
    const converted = await transcodeStagedJpegs(join(sparseIn, 'images'), deps.runGdal);
    if (converted > 0) {
      process.stderr.write(`bakeMesh: re-read ${converted} four-band frame(s) as RGB\n`);
    }

    // OpenMVS caches depth maps as `depth####.dmap` keyed by image *index*, and
    // silently reuses any it finds — a rerun whose frame set or order moved
    // feeds stale maps to the wrong images and aborts mid-fusion.
    const staleDmaps = (await readdir(workDir)).filter((name) => name.endsWith('.dmap'));
    await Promise.all(staleDmaps.map((name) => rm(join(workDir, name))));

    process.stderr.write(
      `bakeMesh: reconstructing ${harvest.poses.length} frame(s) in ${workDir}…\n`,
    );
    for (const stage of bakeStages()) {
      // A stage that exits 0 without writing must fail the next stage's
      // missing-input check, never ship the previous run's file.
      await rm(join(workDir, stage.output), { recursive: true, force: true });
      if (stage.tool === 'colmap') await deps.runColmap(stage.args);
      else await deps.runOpenMvs(stage.tool, stage.args);
    }
  }

  if (!existsSync(glbPath)) {
    throw new Error(
      `bakeMesh: TextureMesh exited 0 but wrote no ${glbPath} — check its ` +
        '`--export-type` flag against the installed OpenMVS.',
    );
  }
  // `NodeIO`, not the viewer's `readMeshGlb`: OpenMVS references its atlas as a
  // sidecar URI beside the GLB, and only NodeIO resolves one.
  const geometry = meshGlbGeometry(await new NodeIO().read(glbPath));

  const jpeg = await sharp(geometry.image.bytes).jpeg({ quality: 90 }).toBuffer();

  const assetDir = groupAssetDir(group.id, ASSET_ID);
  await mkdir(assetDir, { recursive: true });
  await writeFile(
    join(assetDir, 'mesh.glb'),
    await packMeshGlb({ ...geometry, image: { bytes: jpeg, mimeType: 'image/jpeg' } }),
  );

  const asset: TexturedMeshAsset = {
    kind: 'mesh',
    id: ASSET_ID,
    label: `${group.name} — skråfoto MVS mesh`,
    transform: { translationM: [0, 0, 0], rotation: [0, 0, 0, 1], scale: 1 },
    provenance: {
      source: 'nationalGeodataApi',
      // One flight per collection, so the first frame dates the whole set.
      sourceVintage: items[0]!.properties.datetime.slice(0, 10),
      pipeline: [
        { step: 'fetchSkraafoto', version: group.skraafoto.collection },
        { step: 'colmap', version: colmapVersion },
        { step: 'openmvs', version: openMvsVersion },
      ],
    },
    triangleCount: geometry.indices.length / 3,
    artifactUrl: assetArtifactUrl(group.id, ASSET_ID, 'mesh.glb'),
  };

  await publishAsset(group, asset);

  return asset;
}

/** The 2025 nadir frames carry four components, which OpenCV — so every OpenMVS
 *  stage — refuses outright. GDAL re-reads them band-wise (spec §6.2). */
async function transcodeStagedJpegs(imagesDir: string, runGdal: GdalRunner): Promise<number> {
  const names = (await readdir(imagesDir)).filter((name) => name.endsWith('.jpg'));
  let converted = 0;
  for (const name of names) {
    const path = join(imagesDir, name);
    const { channels, space } = await sharp(path).metadata();
    if (channels === 3 && space === 'srgb') continue;
    const rgbPath = `${path}.rgb.jpg`;
    await runGdal([...GDAL_RGB_ARGV, path, rgbPath]);
    await rename(rgbPath, path);
    converted++;
  }
  return converted;
}

/** The version already stamped on this group's mesh asset for `step`, if any. */
async function manifestStepVersion(
  manifestPath: string,
  step: string,
): Promise<string | undefined> {
  const manifest = await readFile(manifestPath, 'utf8').then(
    (text) => JSON.parse(text) as SceneManifest,
    () => null,
  );
  return manifest?.assets
    .find((asset) => asset.id === ASSET_ID)
    ?.provenance.pipeline.find((entry) => entry.step === step)?.version;
}

/** OpenMVS installs outside any package manager's prefix, so `OPENMVS_BIN`
 *  points at the build's `bin/OpenMVS/` when it is not on PATH. */
function openMvsCommand(tool: string): string {
  const dir = process.env.OPENMVS_BIN;
  return dir ? join(dir, tool) : tool;
}

function spawnStage(command: string, args: readonly string[], cwd: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, [...args], { cwd, stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`bakeMesh: \`${command} ${args[0]}\` exited with code ${code}`));
    });
  });
}

function colmapVersion(): string {
  const result = spawnSync('colmap', ['-h'], { encoding: 'utf8' });
  // An empty first line would stamp the asset's provenance with `''`, which
  // reads as "unknown COLMAP" forever after — so it fails like a missing binary.
  const banner = result.status === 0 ? (result.stdout ?? '').split('\n')[0]?.trim() : undefined;
  if (!banner) {
    throw new Error(
      'bakeMesh: `colmap -h` printed no version — install COLMAP with `brew install colmap` ' +
        '(4.2.0, without GPU support; see tools/scene-workbench/README.md).',
    );
  }
  return banner;
}

function openMvsVersion(): string {
  // `-h` exits 1 on every OpenMVS tool, so the banner is the only signal that
  // the binary ran at all.
  const result = spawnSync(openMvsCommand('DensifyPointCloud'), ['-h'], { encoding: 'utf8' });
  const banner = (result.stdout ?? '').split('\n')[0]?.match(/OpenMVS.*/)?.[0];
  if (!banner) {
    throw new Error(
      'bakeMesh: no OpenMVS banner from `DensifyPointCloud -h` — build OpenMVS v2.4.0 from ' +
        'source and put its bin/OpenMVS on PATH (or set OPENMVS_BIN); recipe in ' +
        'tools/scene-workbench/README.md.',
    );
  }
  return banner.trim();
}

async function main(): Promise<void> {
  const start = Date.now();
  const group = sceneGroupFromArgv(process.argv);
  const workDir = meshWorkDir(group);
  await mkdir(workDir, { recursive: true });

  const asset = await bakeMesh(
    group,
    {
      runCct: spawnCct,
      runColmap: (args) => spawnStage('colmap', args, workDir),
      runOpenMvs: (tool, args) => spawnStage(openMvsCommand(tool), args, workDir),
      runGdal: (args) => spawnStage('gdal_translate', args, workDir),
      colmapVersion,
      openMvsVersion,
    },
    { reuseGlb: process.argv.includes('--reuse-glb') },
  );
  const minutes = ((Date.now() - start) / 60000).toFixed(1);
  process.stderr.write(
    `bakeMesh: done in ${minutes} min — ${asset.triangleCount.toLocaleString()} triangles → ${asset.artifactUrl}\n`,
  );
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
