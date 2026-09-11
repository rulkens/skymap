#!/usr/bin/env node
/**
 * bakeSplats — orchestrates one scene group's Gaussian-splat bake (`--group
 * <id>`, default `soendermarken`): the fetched skråfoto frames + the LiDAR
 * cloud as a points3D seed → a known-pose COLMAP model → one `brush-cli` train
 * → `splats.bin` + the group's `manifest.json` + the `scenes.json` registry
 * (spec §§4-6).
 *
 * `runCct`/`runBrush` are injected so the orchestration runs without PROJ or
 * Brush installed (the pose maths, the COLMAP writer, the PLY reader and the
 * packer are tested in isolation); `main()` wires the real subprocesses.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sceneGroupFromArgv } from './groups/sceneGroupFromArgv';
import { groupPhotoPoses } from './poses/groupPhotoPoses';
import { spawnCct } from './poses/spawnCct';
import { lidarFloorZM } from './lidar/lidarFloorZM';
import { packSplats } from './pack/packSplats';
import { readGaussianPly } from './splats/readGaussianPly';
import { writeColmapModel } from './splats/writeColmapModel';
import { assetArtifactUrl, groupAssetDir, groupManifestPath } from './manifest/geo3dLayout';
import { publishAsset } from './manifest/publishAsset';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { lonLatBoundsToEnuM } from '../utils/scene/lonLatBoundsToEnuM';
import { readStacItems } from '../utils/skraafoto/readStacItems';
import { skraafotoHarvestDir } from '../utils/skraafoto/skraafotoHarvestDir';
import type { CctRunner } from './poses/topocentricPositionsM';
import type { SceneGroupDefinition } from './@types/SceneGroupDefinition';
import type { SkraafotoStacItem } from './@types/SkraafotoStacItem';
import type { GaussianSplatAsset } from '../scene-workbench/@types/GaussianSplatAsset';
import type { SceneManifest } from '../scene-workbench/@types/SceneManifest';

/** Stable across re-runs, so a re-bake upserts the one asset rather than
 *  accumulating siblings under a fresh id. */
const ASSET_ID = 'splats';
/** `bakeLidar.ts`'s asset id — its `points.bin` is this bake's points3D seed. */
const LIDAR_ASSET_ID = 'lidar';
const PLY_NAME = 'final.ply';
const POINT_SAMPLE_TARGET = 200_000;
const TRAIN_ITERS = 30000;
/** Slack below the LiDAR floor for real basements and the cloud's own vertical
 *  spread; why an airborne bake buries splats at all is in the README's
 *  `bake-splats` step. */
const FLOOR_MARGIN_M = 5;

export type BrushRunner = (colmapDir: string, maxResolutionPx: number) => Promise<void>;

export async function bakeSplats(
  group: SceneGroupDefinition,
  deps: {
    readonly runCct: CctRunner;
    readonly runBrush: BrushRunner;
    readonly brushVersion: () => string;
  },
  /** `reusePly`: pack the last run's export instead of staging and training
   *  again — the only affordable way to re-tune the prune on a 30k-iteration
   *  bake. The manifest's existing brush-cli stamp rides along, so a repack
   *  never credits the geometry to whatever version happens to be installed. */
  options: { readonly reusePly?: boolean } = {},
): Promise<GaussianSplatAsset> {
  const pointsBinPath = join(groupAssetDir(group.id, LIDAR_ASSET_ID), 'points.bin');
  if (!existsSync(pointsBinPath)) {
    throw new Error(
      `bakeSplats: no LiDAR seed at ${pointsBinPath} — run \`npm run bake-lidar\` first; ` +
        "it is the COLMAP model's points3D initialisation.",
    );
  }

  const collectionDir = skraafotoHarvestDir(rawDataPath('skraafoto.dir'), group);
  const colmapDir = join(collectionDir, `colmap-${group.id}`);
  const plyPath = join(colmapDir, PLY_NAME);
  const manifestPath = groupManifestPath(group.id);

  let brushVersion: string;
  // Only the frames that produced a pose; a repack derives none, so it reads the
  // harvest purely to date the asset below.
  let items: readonly SkraafotoStacItem[];
  if (options.reusePly) {
    if (!existsSync(plyPath)) {
      throw new Error(`bakeSplats: --reuse-ply, but no export at ${plyPath} to pack.`);
    }
    // Nothing trained here, so the trainer's stamp carries forward; probing is
    // the fallback only, and lazy, so a repack works with brush-cli uninstalled.
    brushVersion = (await manifestBrushVersion(manifestPath)) ?? deps.brushVersion();
    items = await readStacItems(collectionDir);
  } else {
    // Probed before the staging below copies every frame's JPEG, so a missing
    // brush-cli costs a second rather than the whole copy.
    brushVersion = deps.brushVersion();

    const harvest = await groupPhotoPoses(group, { runCct: deps.runCct });
    const poses = harvest.poses;
    items = harvest.items;
    const maxResolutionPx = Math.max(
      ...poses.map((pose) => Math.max(pose.imageWidthPx, pose.imageHeightPx)),
    );

    await writeColmapModel({
      poses,
      pointsBinPath,
      pointSampleTarget: POINT_SAMPLE_TARGET,
      outDir: colmapDir,
    });

    // `colmapDir` survives between bakes, so a run where Brush exits 0 without
    // exporting would otherwise re-read the previous run's PLY and ship it as
    // this run's training output. Deleting first makes that failure visible
    // below — a train reads only a PLY it just produced, and only a `reusePly`
    // repack packs an older one, under that run's stamp.
    await rm(plyPath, { force: true });

    process.stderr.write(
      `bakeSplats: training ${poses.length} frame(s) with brush-cli, ` +
        `max resolution ${maxResolutionPx} px…\n`,
    );
    await deps.runBrush(colmapDir, maxResolutionPx);
  }

  const ply = await readFile(plyPath).catch(() => {
    throw new Error(
      `bakeSplats: brush-cli exited 0 but wrote no ${plyPath} — check its ` +
        '`--export-path`/`--export-name` flags against the installed version.',
    );
  });
  // Node pools small Buffers, so slice out this file's own bytes before
  // handing the ArrayBuffer on (same trap as writeColmapModel's points3D read).
  const { splats, shDegree } = readGaussianPly(
    ply.buffer.slice(ply.byteOffset, ply.byteOffset + ply.byteLength) as ArrayBuffer,
  );
  if (splats.length === 0) {
    throw new Error(`bakeSplats: brush-cli exported zero splats for group "${group.id}"`);
  }

  const floorZM = (await lidarFloorZM(pointsBinPath)) - FLOOR_MARGIN_M;
  // Each frame sees ~1.4 × 1 km, so the trained model reaches far past the crop
  // the LiDAR bake already applies (PDAL, same bounds) — without this the two
  // assets disagree about where the scene ends.
  const cropM = lonLatBoundsToEnuM(group.bounds, group.anchor.latDeg, group.anchor.lonDeg);
  let belowFloor = 0;
  let outsideCrop = 0;
  const kept = splats.filter((splat) => {
    if (splat.zM < floorZM) {
      belowFloor++;
      return false;
    }
    if (
      splat.xM < cropM.minXM ||
      splat.xM > cropM.maxXM ||
      splat.yM < cropM.minYM ||
      splat.yM > cropM.maxYM
    ) {
      outsideCrop++;
      return false;
    }
    return true;
  });
  process.stderr.write(
    `bakeSplats: pruned ${(splats.length - kept.length).toLocaleString()} of ` +
      `${splats.length.toLocaleString()} splat(s) — ${belowFloor.toLocaleString()} below ` +
      `${floorZM.toFixed(1)} m, ${outsideCrop.toLocaleString()} outside the group bounds\n`,
  );
  if (kept.length === 0) {
    throw new Error(
      `bakeSplats: every splat sits below the ${floorZM.toFixed(1)} m floor or outside the ` +
        'group bounds — the export and the LiDAR seed are in different frames.',
    );
  }

  const assetDir = groupAssetDir(group.id, ASSET_ID);
  await mkdir(assetDir, { recursive: true });
  await writeFile(join(assetDir, 'splats.bin'), packSplats(kept, shDegree));

  const asset: GaussianSplatAsset = {
    kind: 'gaussianSplat',
    id: ASSET_ID,
    label: `${group.name} — skråfoto Gaussian splats`,
    transform: { translationM: [0, 0, 0], rotation: [0, 0, 0, 1], scale: 1 },
    provenance: {
      source: 'nationalGeodataApi',
      // One flight per collection, so the first frame dates the whole set.
      sourceVintage: items[0]!.properties.datetime.slice(0, 10),
      pipeline: [
        { step: 'fetchSkraafoto', version: group.skraafoto.collection },
        { step: 'brush-cli', version: brushVersion },
      ],
    },
    splatCount: kept.length,
    artifactUrl: assetArtifactUrl(group.id, ASSET_ID, 'splats.bin'),
  };

  await publishAsset(group, asset);

  return asset;
}

/** The brush-cli version already stamped on this group's splats asset, if the
 *  manifest exists and carries one. */
async function manifestBrushVersion(manifestPath: string): Promise<string | undefined> {
  const manifest = await readFile(manifestPath, 'utf8').then(
    (text) => JSON.parse(text) as SceneManifest,
    () => null,
  );
  return manifest?.assets
    .find((asset) => asset.id === ASSET_ID)
    ?.provenance.pipeline.find((step) => step.step === 'brush-cli')?.version;
}

function spawnBrush(colmapDir: string, maxResolutionPx: number): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    // `--with-viewer` defaults false once a source path is given, so no flag.
    const child = spawn(
      'brush-cli',
      [
        colmapDir,
        '--sh-degree',
        '1',
        '--total-train-iters',
        String(TRAIN_ITERS),
        '--export-path',
        colmapDir,
        '--export-name',
        PLY_NAME,
        // Brush silently re-downsamples past this, undoing the harvest's own
        // resolution choice — so it follows the largest frame actually staged.
        '--max-resolution',
        String(maxResolutionPx),
      ],
      { stdio: ['ignore', 'inherit', 'inherit'] },
    );
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`bakeSplats: \`brush-cli\` exited with code ${code}`));
    });
  });
}

function brushVersion(): string {
  const result = spawnSync('brush-cli', ['--version'], { encoding: 'utf8' });
  if (result.status !== 0) {
    // A stale toolchain is the usual cause of a failed `cargo install`, so name it.
    // `--locked` matters: an unlocked build resolves burn to its current main,
    // which panicked in Brush's splat init ("require_grad requires autodiff").
    const rustc = spawnSync('rustc', ['--version'], { encoding: 'utf8' });
    const toolchain = rustc.status === 0 ? rustc.stdout.trim() : 'none on PATH';
    throw new Error(
      'bakeSplats: `brush-cli --version` failed — is Brush installed and on PATH ' +
        '(cargo puts it in ~/.cargo/bin)? Install with:\n' +
        '  rustup update && cargo install --locked --git https://github.com/ArthurBrussee/brush brush-cli\n' +
        `  local Rust toolchain: ${toolchain}`,
    );
  }
  return result.stdout.trim();
}

async function main(): Promise<void> {
  const start = Date.now();
  const asset = await bakeSplats(
    sceneGroupFromArgv(process.argv),
    { runCct: spawnCct, runBrush: spawnBrush, brushVersion },
    { reusePly: process.argv.includes('--reuse-ply') },
  );
  const seconds = ((Date.now() - start) / 1000).toFixed(1);
  process.stderr.write(
    `bakeSplats: done in ${seconds}s — ${asset.splatCount.toLocaleString()} splats → ${asset.artifactUrl}\n`,
  );
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
