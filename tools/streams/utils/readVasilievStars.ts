import { readFileSync } from 'node:fs';

import type { VasilievStar } from '../@types/VasilievStar';

/** Column order of stars.txt (data/raw/vasiliev2021/README.md); Tstrip is column 16, 1-based. */
const T_STRIP_COLUMN = 15;

export function readVasilievStars(path: string): VasilievStar[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .map((line) => {
      const c = line.trim().split(/\s+/).map(Number);
      return {
        x: c[0]!,
        y: c[1]!,
        z: c[2]!,
        vx: c[3]!,
        vy: c[4]!,
        vz: c[5]!,
        ra: c[6]!,
        dec: c[7]!,
        distanceKpc: c[8]!,
        tStripGyr: c[T_STRIP_COLUMN]!,
      };
    });
}
