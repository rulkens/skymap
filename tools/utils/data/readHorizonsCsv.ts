/**
 * readHorizonsCsv — a raw Horizons CSV (`formatHorizonsCsv`'s layout) back into rows. Velocity
 * columns are present only for state files.
 */
import { readFileSync } from 'node:fs';

import type { HorizonsVectorRow } from '../../parsers/@types/HorizonsVectorRow';

type Columns = [number, number, number, number, number, number, number];

export function readHorizonsCsv(path: string): HorizonsVectorRow[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .slice(1)
    .filter((line) => line.length > 0)
    .map((line) => {
      const c = line.split(',').map(Number) as Columns;
      const position = { jd: c[0], xKm: c[1], yKm: c[2], zKm: c[3] };
      return Number.isNaN(c[4]) || c[4] === undefined
        ? position
        : { ...position, vxKmS: c[4], vyKmS: c[5], vzKmS: c[6] };
    });
}
