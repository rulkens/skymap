#!/usr/bin/env node
/**
 * bakeMesh — one scene group's textured MVS mesh (`--group <id>`): harvested
 * skråfoto frames + the LiDAR points3D seed → a known-pose COLMAP model →
 * triangulate/undistort → OpenMVS densify, mesh, [refine,] texture → a
 * re-packed `mesh.glb` + the manifest (spec §6.2). Each OpenMVS stage names
 * its output after its input's stem (`_dense`/`_mesh`/`_refine`/`_texture`,
 * confirmed against v2.4.0), so `--refine` shifts what the texture stage and
 * the re-pack read. The runners are injected so this runs with neither
 * toolchain installed; `main()` wires the real subprocesses.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { sceneGroupFromArgv } from './groups/sceneGroupFromArgv';
import { groupPhotoPoses } from './poses/groupPhotoPoses';
import { spawnCct } from './poses/spawnCct';
import { packMeshGlb } from './pack/packMeshGlb';
import { writeColmapModel } from './splats/writeColmapModel';
import { assetArtifactUrl, groupAssetDir, groupManifestPath } from './manifest/geo3dLayout';
import { publishAsset } from './manifest/publishAsset';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { readStacItems } from '../utils/skraafoto/readStacItems';
import { skraafotoHarvestDir } from '../utils/skraafoto/skraafotoHarvestDir';
import { readMeshGlb } from '../scene-workbench/src/scene/readMeshGlb';
import type { CctRunner } from './poses/topocentricPositionsM';
import type { SceneGroupDefinition } from './@types/SceneGroupDefinition';
import type { SkraafotoStacItem } from './@types/SkraafotoStacItem';
import type { SceneManifest } from '../scene-workbench/@types/SceneManifest';
import type { TexturedMeshAsset } from '../scene-workbench/@types/TexturedMeshAsset';

export type ColmapRunner = (args: readonly string[]) => Promise<void>;
export type OpenMvsRunner = (tool: string, args: readonly string[]) => Promise<void>;

/** Stable across re-runs, so a re-bake upserts the one asset. */
const ASSET_ID = 'mesh';
/** `bakeLidar.ts`'s asset id — its `points.bin` is this bake's points3D seed. */
const LIDAR_ASSET_ID = 'lidar';
const POINT_SAMPLE_TARGET = 200_000;
/** One number for the atlas ceiling: past it TextureMesh splits the mesh across
 *  materials (`readMeshGlb` refuses that), and the re-pack must not undo the cap. */
const MAX_TEXTURE_PX = 8192;

type Stage = {
  readonly tool: string;
  readonly args: readonly string[];
  readonly output?: string;
  /** The tool opens `output` rather than creating it, so the loop has to
   *  re-make the directory it just cleared (`point_triangulator` exits with
   *  "`output_path` is not a directory" otherwise — on a first run too). */
  readonly outputDirIsInput?: true;
};

const COLMAP_STAGES: readonly Stage[] = [
  {
    tool: 'colmap',
    output: 'database.db',
    args: [
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
  },
  // No `output`: the matches land in the database the previous stage filled.
  {
    tool: 'colmap',
    args: [
      'exhaustive_matcher',
      '--database_path',
      'database.db',
      '--FeatureMatching.use_gpu',
      '0',
    ],
  },
  {
    tool: 'colmap',
    output: 'sparse',
    outputDirIsInput: true,
    args: [
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
  },
  {
    tool: 'colmap',
    output: 'dense',
    args: [
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
  },
];

/** The workdir every stage runs in, `bakeMesh`'s and `main()`'s runners alike. */
export function meshWorkDir(group: SceneGroupDefinition): string {
  return join(skraafotoHarvestDir(rawDataPath('skraafoto.dir'), group), `mvs-${group.id}`);
}

function openMvsStages(options: { fullRes?: boolean; refine?: boolean }): {
  readonly stages: readonly Stage[];
  readonly texturedStem: string;
} {
  const stages: Stage[] = [
    {
      tool: 'InterfaceCOLMAP',
      output: 'scene.mvs',
      args: ['-i', 'dense', '-o', 'scene.mvs', '--image-folder', 'dense/images'],
    },
    {
      tool: 'DensifyPointCloud',
      output: 'scene_dense.mvs',
      args: ['scene.mvs', '--resolution-level', options.fullRes ? '0' : '1', '--number-views', '0'],
    },
    { tool: 'ReconstructMesh', output: 'scene_dense_mesh.mvs', args: ['scene_dense.mvs'] },
  ];
  let stem = 'scene_dense_mesh';
  if (options.refine) {
    stages.push({
      tool: 'RefineMesh',
      output: 'scene_dense_mesh_refine.mvs',
      args: ['scene_dense_mesh.mvs', '--resolution-level', '1'],
    });
    stem = 'scene_dense_mesh_refine';
  }
  stages.push({
    tool: 'TextureMesh',
    output: `${stem}_texture.glb`,
    args: [`${stem}.mvs`, '--export-type', 'glb', '--max-texture-size', String(MAX_TEXTURE_PX)],
  });
  return { stages, texturedStem: stem };
}

export async function bakeMesh(
  group: SceneGroupDefinition,
  deps: {
    readonly runCct: CctRunner;
    readonly runColmap: ColmapRunner;
    readonly runOpenMvs: OpenMvsRunner;
    readonly colmapVersion: () => string;
    readonly openMvsVersion: () => string;
  },
  /** `reuseGlb`: re-pack the last run's OpenMVS export instead of reconstructing
   *  again, carrying the manifest's stamps so the asset never credits its
   *  geometry to whatever version happens to be installed (`--reuse-ply`'s
   *  contract, `bakeSplats.ts`). */
  options: {
    readonly fullRes?: boolean;
    readonly refine?: boolean;
    readonly reuseGlb?: boolean;
  } = {},
): Promise<TexturedMeshAsset> {
  const pointsBinPath = join(groupAssetDir(group.id, LIDAR_ASSET_ID), 'points.bin');
  if (!existsSync(pointsBinPath)) {
    throw new Error(
      `bakeMesh: no LiDAR seed at ${pointsBinPath} — run \`npm run bake-lidar\` first; ` +
        "it is the COLMAP model's points3D initialisation.",
    );
  }

  const workDir = meshWorkDir(group);
  const manifestPath = groupManifestPath(group.id);
  const { stages, texturedStem } = openMvsStages(options);
  const glbPath = join(workDir, `${texturedStem}_texture.glb`);

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
    // dropped from the model but its staged JPEG would survive, and COLMAP
    // reconstructs from the directory rather than from `images.txt`.
    const sparseIn = join(workDir, 'sparse-in');
    await rm(sparseIn, { recursive: true, force: true });
    await writeColmapModel({
      poses: harvest.poses,
      pointsBinPath,
      pointSampleTarget: POINT_SAMPLE_TARGET,
      outDir: sparseIn,
    });

    process.stderr.write(
      `bakeMesh: reconstructing ${harvest.poses.length} frame(s) in ${workDir}…\n`,
    );
    for (const stage of [...COLMAP_STAGES, ...stages]) {
      // A stage that exits 0 without writing must fail the next stage's
      // missing-input check, never ship the previous run's file.
      if (stage.output) {
        await rm(join(workDir, stage.output), { recursive: true, force: true });
        if (stage.outputDirIsInput) await mkdir(join(workDir, stage.output), { recursive: true });
      }
      if (stage.tool === 'colmap') await deps.runColmap(stage.args);
      else await deps.runOpenMvs(stage.tool, stage.args);
    }
  }

  const exported = await readFile(glbPath).catch(() => {
    throw new Error(
      `bakeMesh: TextureMesh exited 0 but wrote no ${glbPath} — check its ` +
        '`--export-type` flag against the installed OpenMVS.',
    );
  });
  const geometry = await readMeshGlb(
    // Node pools small Buffers, so slice out this file's own bytes first.
    exported.buffer.slice(exported.byteOffset, exported.byteOffset + exported.byteLength),
  );

  const atlas = sharp(geometry.image.bytes);
  const { width = 0, height = 0 } = await atlas.metadata();
  const jpeg =
    Math.max(width, height) > MAX_TEXTURE_PX
      ? await atlas
          .resize({ width: MAX_TEXTURE_PX, height: MAX_TEXTURE_PX, fit: 'inside' })
          .jpeg({ quality: 90 })
          .toBuffer()
      : await atlas.jpeg({ quality: 90 }).toBuffer();

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
      colmapVersion,
      openMvsVersion,
    },
    {
      fullRes: process.argv.includes('--full-res'),
      refine: process.argv.includes('--refine'),
      reuseGlb: process.argv.includes('--reuse-glb'),
    },
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
