import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

import type { HorizonBakeTask } from './@types/HorizonBakeTask';
import type { HorizonBakeWorkerData } from './@types/HorizonBakeWorkerData';
import { bakeHorizonTileResolved } from './utils/bakeHorizonTileResolved';
import { surfaceTilePath } from '../../../src/layers/body/surfaceTiles/format/utils/surfaceTilePath';
import { readHeightPyramid } from './utils/readHeightPyramid';
import { writeHorizonTile } from './utils/writeHorizonTile';

// A decoded height tile is 66 KB; this bounds a worker near 100 MB.
const MAX_CACHED_TILES = 1500;

const { imagesDir, prefix, radiusM } = workerData as HorizonBakeWorkerData;
const pyramid = readHeightPyramid(imagesDir, prefix, radiusM);

/** One tile per message: bake, write, answer with the kind written (or the error). */
parentPort!.on('message', async ({ z, x, y }: HorizonBakeTask) => {
  try {
    pyramid.trim(MAX_CACHED_TILES);
    const tile = await bakeHorizonTileResolved(pyramid, z, x, y);
    await writeHorizonTile(
      join(imagesDir, surfaceTilePath({ product: 'horizon', z, x, y }, prefix)),
      tile,
    );
    parentPort!.postMessage({ kind: tile.kind });
  } catch (error) {
    parentPort!.postMessage({ error: `${z}/${x}/${y}: ${(error as Error).stack}` });
  }
});
