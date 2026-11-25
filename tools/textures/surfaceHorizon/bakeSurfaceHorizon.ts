#!/usr/bin/env node
/**
 * bakeSurfaceHorizon — bakes a body's horizon-angle tiles from the height archives already on
 * disk: `npm run bake-horizon -- --body earth|moon|mars [--band <i>] [--workers N]`, `--band`
 * indexing `manifest.json`'s bands. Run after the height bake (see README for the order).
 *
 * Tiles go to `<prefix>/horizon/<z>/<x>/<y>.webp` (zero bytes when flat), one worker-thread
 * task each; a tile already on disk is skipped, so an interrupted bake resumes. The archives,
 * `index.txt`, the globe images and `builtFrom.horizon` are written last, only after every
 * tile of the selected bands exists, like `bakeAll`: a killed run leaves the manifest as it was.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import type { SurfaceTileBodyId } from '../../../src/layers/body/surfaceTiles/format/@types/SurfaceTileBodyId';
import type { SurfaceTileManifest } from '../../../src/layers/body/surfaceTiles/format/@types/SurfaceTileManifest';
import type { SurfaceTileManifestBand } from '../../../src/layers/body/surfaceTiles/format/@types/SurfaceTileManifestBand';
import { SURFACE_TILE_REGISTRY } from '../../../src/layers/body/surfaceTiles/format/data/surfaceTileRegistry';
import { writeFileAtomic } from '../../utils/io/writeFileAtomic';
import { mergeSurfaceTileManifest } from '../../utils/textures/mergeSurfaceTileManifest';
import { packSurfaceTileLevels } from '../../utils/textures/packSurfaceTileLevels';
import type { HorizonBakeReply } from './@types/HorizonBakeReply';
import type { HorizonBakeTask } from './@types/HorizonBakeTask';
import type { HorizonBakeWorkerData } from './@types/HorizonBakeWorkerData';
import { HORIZON_BODY_RADIUS_M } from './data/horizonBodyRadiusM';
import { surfaceTilePath } from '../../../src/layers/body/surfaceTiles/format/utils/surfaceTilePath';
import { horizonTilesOfBand } from './utils/horizonTilesOfBand';
import { writeGlobeHorizon } from './utils/writeGlobeHorizon';

const IMAGES_DIR = resolve('public/data/images');

/** `--name value`, or undefined when absent. */
function flagValue(argv: readonly string[], name: string): string | undefined {
  const at = argv.indexOf(name);
  return at < 0 ? undefined : argv[at + 1];
}

/** Runs `tasks` over `workerCount` worker threads, one tile per message; resolves with the
 *  counts of flat and image tiles written. */
async function bakeTiles(
  tasks: readonly HorizonBakeTask[],
  workerData: HorizonBakeWorkerData,
  workerCount: number,
): Promise<{ flat: number; image: number }> {
  const counts = { flat: 0, image: 0 };
  if (tasks.length === 0) return counts;
  const workerUrl = new URL('./horizonBakeWorker.ts', import.meta.url);
  let next = 0;
  let done = 0;
  const started = Date.now();
  await Promise.all(
    Array.from({ length: Math.min(workerCount, tasks.length) }, () => {
      const worker = new Worker(workerUrl, { workerData });
      return new Promise<void>((resolveWorker, reject) => {
        const feed = (): void => {
          if (next >= tasks.length) {
            void worker.terminate().then(() => resolveWorker());
            return;
          }
          worker.postMessage(tasks[next++]);
        };
        worker.on('message', (reply: HorizonBakeReply) => {
          if (reply.error !== undefined) {
            void worker.terminate();
            reject(new Error(reply.error));
            return;
          }
          counts[reply.kind]++;
          done++;
          if (done % 50 === 0 || done === tasks.length) {
            const seconds = (Date.now() - started) / 1000;
            process.stderr.write(
              `  ${done}/${tasks.length} tiles, ${(done / seconds).toFixed(1)}/s (${counts.flat} flat)\n`,
            );
          }
          feed();
        });
        worker.on('error', reject);
        feed();
      });
    }),
  );
  return counts;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const bodyFlag = flagValue(argv, '--body');
  if (bodyFlag === undefined || !(bodyFlag in SURFACE_TILE_REGISTRY)) {
    throw new Error(`bakeSurfaceHorizon: --body must be earth, moon or mars, got '${bodyFlag}'`);
  }
  const bodyId = bodyFlag as SurfaceTileBodyId;
  const { manifestKey } = SURFACE_TILE_REGISTRY[bodyId];
  const manifestPath = join(IMAGES_DIR, manifestKey, 'manifest.json');
  const indexPath = join(IMAGES_DIR, manifestKey, 'index.txt');
  for (const path of [manifestPath, indexPath]) {
    if (!existsSync(path))
      throw new Error(`bakeSurfaceHorizon: ${path} is missing, bake heights first`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as SurfaceTileManifest;
  const indexLines = readFileSync(indexPath, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0);

  const bandFlag = flagValue(argv, '--band');
  const bands =
    bandFlag === undefined
      ? manifest.bands
      : manifest.bands.filter((_, i) => i === Number(bandFlag));
  if (bands.length === 0) {
    throw new Error(
      `bakeSurfaceHorizon: no band ${bandFlag}, the manifest has ${manifest.bands.length}`,
    );
  }
  const workerCount = Number(
    flagValue(argv, '--workers') ?? Math.max(1, availableParallelism() - 1),
  );

  const { prefix } = manifest;
  const tasks = bands.flatMap((band) =>
    horizonTilesOfBand(indexLines, prefix, band, manifest.tilePx),
  );
  const pending = tasks.filter(
    ({ z, x, y }) =>
      !existsSync(join(IMAGES_DIR, surfaceTilePath({ product: 'horizon', z, x, y }, prefix))),
  );
  process.stderr.write(
    `bakeSurfaceHorizon: ${bodyId}, ${bands.length} band(s), ${tasks.length} tiles (${pending.length} to bake) on ${workerCount} worker(s)\n`,
  );
  const counts = await bakeTiles(
    pending,
    { imagesDir: IMAGES_DIR, prefix, radiusM: HORIZON_BODY_RADIUS_M[bodyId] },
    workerCount,
  );
  process.stderr.write(`  baked ${counts.image} image + ${counts.flat} flat tiles\n`);

  const horizonLines = [
    ...new Set([
      ...indexLines.filter((line) => line.startsWith(`${prefix}/horizon/`)),
      ...tasks.map(({ z, x, y }) => surfaceTilePath({ product: 'horizon', z, x, y }, prefix)),
    ]),
  ].sort();
  const sorted = [...new Set([...indexLines, ...horizonLines])].sort();
  writeFileAtomic(indexPath, new TextEncoder().encode(`${sorted.join('\n')}\n`));
  process.stderr.write(
    `  ${packSurfaceTileLevels(IMAGES_DIR, prefix, horizonLines)} archive files packed\n`,
  );
  for (const file of await writeGlobeHorizon(IMAGES_DIR, prefix, bodyId)) {
    process.stderr.write(`  globe image ${file}\n`);
  }

  // Last, so an interrupted run leaves the previous manifest naming only what is whole.
  const horizonBands: SurfaceTileManifestBand[] = bands.map((band) => ({
    ...band,
    builtFrom: {
      horizon: {
        sourceId: 'derived:height',
        attribution: band.builtFrom.height?.attribution ?? '',
        vintage: band.builtFrom.height?.vintage ?? '',
      },
    },
  }));
  const merged = mergeSurfaceTileManifest(manifest, { ...manifest, bands: horizonBands });
  writeFileSync(manifestPath, `${JSON.stringify(merged, null, 2)}\n`);
  process.stderr.write(`done; horizon under ${join(IMAGES_DIR, prefix, 'horizon')}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
