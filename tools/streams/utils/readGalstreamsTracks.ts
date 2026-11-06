/**
 * Every master-log row of a galstreams checkout joined with its track file
 * (`tracks/track.<Imp>.<Name>.<TrackRefs>.ecsv`). Joining from the log rather than globbing the
 * folder keeps names with dots in them ('20.0-1') intact.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseFloatOrNaN } from '../../utils/math/parseFloatOrNaN';
import type { GalstreamsTrack } from '../@types/GalstreamsTrack';

/** Whitespace-split master-log columns (data/raw/galstreams/README.md). */
const COL = { kind: 0, on: 1, name: 3, ref: 4, widthPhi2: 8 } as const;

function readTrackColumns(path: string): Record<string, number[]> {
  const [header, ...rows] = readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('#'));
  const names = header!.split(',');
  const columns: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, []]));
  for (const row of rows) {
    const cells = row.split(',').map(parseFloatOrNaN);
    if (![0, 1, 2].every((i) => Number.isFinite(cells[i]))) continue;
    names.forEach((n, i) => columns[n]!.push(cells[i]!));
  }
  return columns;
}

export function readGalstreamsTracks(dir: string): GalstreamsTrack[] {
  return readFileSync(join(dir, 'lib/master_log.txt'), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .map((line) => {
      const c = line.trim().split(/\s+/);
      const [kind, name, ref] = [c[COL.kind]!, c[COL.name]!, c[COL.ref]!];
      const width = parseFloatOrNaN(c[COL.widthPhi2] ?? '');
      const t = readTrackColumns(join(dir, `tracks/track.${kind}.${name}.${ref}.ecsv`));
      return {
        kind,
        on: c[COL.on] === '1',
        name,
        ref,
        widthDeg: width > 0 ? width : null,
        ra: t.ra!,
        dec: t.dec!,
        distanceKpc: t.distance!,
        pmRaCosDec: t.pm_ra_cosdec!,
        pmDec: t.pm_dec!,
        radialVelocity: t.radial_velocity!,
      };
    });
}
