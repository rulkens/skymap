import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

import type { HorizonBakeTask } from './@types/HorizonBakeTask';
import type { HorizonBakeWorkerData } from './@types/HorizonBakeWorkerData';
import { assembleHorizonTile } from './utils/assembleHorizonTile';
import { bakeHorizonSubTileResolved } from './utils/bakeHorizonSubTileResolved';
import { surfaceTilePath } from '../../../src/layers/body/surfaceTiles/format/utils/surfaceTilePath';
import { readHeightPyramid } from './utils/readHeightPyramid';
import { writeHorizonTile } from './utils/writeHorizonTile';

// A decoded height tile is 66 KB; this bounds a worker near 100 MB.
const MAX_CACHED_TILES = 1500;

const { imagesDir, prefix, radiusM } = workerData as HorizonBakeWorkerData;
const pyramid = readHeightPyramid(imagesDir, prefix, radiusM);

/** Bakes the tile's 16 sub-tiles, assembles, writes, answers with the kind written (or the error). */
async function bakeTask({ z, x, y }: HorizonBakeTask): Promise<void> {
  try {
    pyramid.trim(MAX_CACHED_TILES);
    const tile = await assembleHorizonTile(
      (subZ, subX, subY) => bakeHorizonSubTileResolved(pyramid, subZ, subX, subY),
      z,
      x,
      y,
    );
    await writeHorizonTile(
      join(imagesDir, surfaceTilePath({ product: 'horizon', z, x, y }, prefix)),
      tile,
    );
    parentPort!.postMessage({ kind: tile.kind });
  } catch (error) {
    parentPort!.postMessage({ error: `${z}/${x}/${y}: ${(error as Error).stack}` });
  }
}

// One tile per message; `bakeTask` reports its own failures, so nothing is left to await.
parentPort!.on('message', (task: HorizonBakeTask) => void bakeTask(task));
