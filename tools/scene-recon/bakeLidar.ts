#!/usr/bin/env node
/**
 * bakeLidar — orchestrates the Søndermarken LiDAR bake: DHM tiles + the
 * GeoDanmark ortho → one `pdal pipeline` run → `points.bin` + the group's
 * `manifest.json` + the `scenes.json` registry (spec §§4-6).
 *
 * `runPdal` is injected so `bakeLidar()` is exercisable without PDAL
 * installed (tasks 4-7 already cover the stage graph, the CSV reader and
 * the packer in isolation); `main()` wires up the real subprocess.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SOENDERMARKEN, type SceneGroupDefinition } from './groups/soendermarken';
import { lidarPipelineStages } from './lidar/lidarPipelineStages';
import { readPdalCsv } from './lidar/readPdalCsv';
import { orthoVrtXml } from './ortho/orthoVrtXml';
import { packPoints, type ScenePoint } from './pack/packPoints';
import { upsertAsset } from './manifest/upsertAsset';
import { upsertGroup } from './manifest/upsertGroup';
import { earthTileIndicesForBounds } from '../utils/scene/earthTileIndicesForBounds';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { writeJsonAtomic } from '../utils/io/writeJsonAtomic';
import { EARTH_TILE_PX } from '../../src/data/bodies/earthTileParams';
import type { PointCloudAsset } from '../scene-workbench/@types/PointCloudAsset';
import type { SceneManifest } from '../scene-workbench/@types/SceneManifest';
import type { GroupRegistry } from '../scene-workbench/@types/GroupRegistry';

/** The GeoDanmark harvest is z19-only (see `geodanmarkTileSource.ts`) — the
 *  only level with a tile tree to colorize from. */
const GEODANMARK_LEVEL = 19;
/** Stable across re-runs, so a re-bake upserts the one asset rather than
 *  accumulating siblings under a fresh id. */
const ASSET_ID = 'lidar';
const GEO3D_DIR = 'public/data/geo3d';

/**
 * DHM Punktsky flight date. The LAS headers' own `creation_year`/`creation_doy`
 * fields are unset (0); this is the date all 8 Søndermarken tiles' point
 * `GpsTime` (Adjusted Standard GPS Time) decodes to — see
 * `data/raw/dhm/README.md` "Flight date" for the derivation.
 */
const DHM_FLIGHT_DATE = '2011-09-20';

export type PdalRunner = (pipelineJsonPath: string) => Promise<void>;

export async function bakeLidar(
  group: SceneGroupDefinition,
  deps: { readonly runPdal: PdalRunner; readonly pdalVersion: () => string },
): Promise<PointCloudAsset> {
  const dhmDir = rawDataPath('dhm.dir');
  const lazFiles = group.dhmTiles.map((tile) => join(dhmDir, `${tile}.las`));
  const missing = lazFiles.filter((path) => !existsSync(path));
  if (missing.length > 0) {
    throw new Error(
      `bakeLidar: ${missing.length}/${lazFiles.length} DHM tile(s) missing from ${dhmDir} ` +
        `— run \`npm run fetch-dhm\` first:\n${missing.map((path) => `  ${path}`).join('\n')}`,
    );
  }

  const workDir = join(dhmDir, '.bake');
  await mkdir(workDir, { recursive: true });

  const rect = earthTileIndicesForBounds(group.bounds, GEODANMARK_LEVEL, EARTH_TILE_PX);
  const levelDir = join(rawDataPath('geodanmark.dir'), String(GEODANMARK_LEVEL));
  const vrtPath = join(workDir, `${group.id}-ortho.vrt`);
  await writeFile(
    vrtPath,
    orthoVrtXml({ levelDir, rect, level: GEODANMARK_LEVEL, tilePx: EARTH_TILE_PX }),
  );

  const csvPath = join(workDir, `${group.id}.csv`);
  const stages = lidarPipelineStages({
    lazFiles,
    bounds: group.bounds,
    orthoVrtPath: vrtPath,
    anchor: group.anchor,
    minPointSpacingM: group.minPointSpacingM,
    dropClassifications: group.dropClassifications,
    outCsvPath: csvPath,
  }).map((stage) =>
    // The Punktsky LAS tiles carry no embedded CRS (data/raw/dhm/README.md
    // "Tile CRS: EPSG:25832") — `filters.reprojection` refuses to run
    // without one, so every `readers.las` stage gets it as a default.
    stage.type === 'readers.las' ? { ...stage, default_srs: 'EPSG:25832' } : stage,
  );
  const pipelineJsonPath = join(workDir, `${group.id}-pipeline.json`);
  await writeFile(pipelineJsonPath, JSON.stringify({ pipeline: stages }, null, 2));

  process.stderr.write(`bakeLidar: running pdal pipeline for "${group.id}"…\n`);
  await deps.runPdal(pipelineJsonPath);

  const points: ScenePoint[] = [];
  for await (const point of readPdalCsv(csvPath)) {
    points.push(point);
  }
  await rm(csvPath, { force: true });

  if (points.length === 0) {
    throw new Error(`bakeLidar: pdal pipeline produced zero points for group "${group.id}"`);
  }

  const assetDir = join(GEO3D_DIR, 'groups', group.id, 'assets', ASSET_ID);
  await mkdir(assetDir, { recursive: true });
  await writeFile(join(assetDir, 'points.bin'), packPoints(points));

  const asset: PointCloudAsset = {
    kind: 'pointCloud',
    id: ASSET_ID,
    label: `${group.name} — DHM Punktsky LiDAR`,
    transform: { translationM: [0, 0, 0], rotation: [0, 0, 0, 1], scale: 1 },
    provenance: {
      source: 'nationalGeodataApi',
      sourceVintage: DHM_FLIGHT_DATE,
      pipeline: [{ step: 'pdal', version: deps.pdalVersion() }],
    },
    pointCount: points.length,
    artifactUrl: `geo3d/groups/${group.id}/assets/${ASSET_ID}/points.bin`,
  };

  const manifestPath = join(GEO3D_DIR, 'groups', group.id, 'manifest.json');
  await writeJsonAtomic<SceneManifest>(manifestPath, (current) =>
    upsertAsset(
      current ?? {
        formatVersion: 1,
        groupId: group.id,
        groupName: group.name,
        anchor: group.anchor,
        assets: [],
      },
      asset,
    ),
  );

  const registryPath = join(GEO3D_DIR, 'scenes.json');
  await writeJsonAtomic<GroupRegistry>(registryPath, (current) =>
    upsertGroup(current ?? { formatVersion: 1, groups: [] }, {
      id: group.id,
      name: group.name,
      manifestUrl: `geo3d/groups/${group.id}/manifest.json`,
    }),
  );

  return asset;
}

function spawnPdal(pipelineJsonPath: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('pdal', ['pipeline', pipelineJsonPath], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`bakeLidar: \`pdal pipeline\` exited with code ${code}`));
    });
  });
}

function pdalVersion(): string {
  const result = spawnSync('pdal', ['--version'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      'bakeLidar: `pdal --version` failed — is PDAL installed and on PATH? ' +
        '(Homebrew: `brew install pdal`.)',
    );
  }
  const match = result.stdout.match(/pdal (\S+)/);
  if (!match) {
    throw new Error(`bakeLidar: could not parse \`pdal --version\` output: ${result.stdout}`);
  }
  return match[1]!;
}

async function main(): Promise<void> {
  const start = Date.now();
  const asset = await bakeLidar(SOENDERMARKEN, { runPdal: spawnPdal, pdalVersion });
  const seconds = ((Date.now() - start) / 1000).toFixed(1);
  process.stderr.write(
    `bakeLidar: done in ${seconds}s — ${asset.pointCount.toLocaleString()} points → ${asset.artifactUrl}\n`,
  );
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
