/**
 * readPdalCsv — streams a `writers.text` csv (header row
 * `X,Y,Z,Red,Green,Blue,Classification`, see lidarPipelineStages) into
 * packer records one line at a time via `readline`, so a hundred-megabyte
 * bake never sits fully in memory.
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

import type { ScenePoint } from '../pack/packPoints';

export async function* readPdalCsv(csvPath: string): AsyncIterable<ScenePoint> {
  const lines = createInterface({
    input: createReadStream(csvPath),
    crlfDelay: Infinity,
  });

  let isHeaderRow = true;
  for await (const line of lines) {
    if (isHeaderRow) {
      isHeaderRow = false;
      continue;
    }
    if (line.length === 0) continue;

    const [x, y, z, r, g, b, classification] = line.split(',');
    yield {
      xM: Number(x),
      yM: Number(y),
      zM: Number(z),
      r: Number(r),
      g: Number(g),
      b: Number(b),
      classification: Number(classification),
    };
  }
}
