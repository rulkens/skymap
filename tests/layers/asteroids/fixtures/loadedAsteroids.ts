/**
 * A five-row catalog with names, through the real writers and parsers: (1) is meshed, (3) has no
 * H and no name, (5) is Astraea. Shared by the selection, search and card tests.
 */
import type { MpcorbRow } from '../../../../tools/@types/asteroids/MpcorbRow';
import { writeAsteroidCatalog } from '../../../../tools/utils/io/writeAsteroidCatalog';
import { writeAsteroidNames } from '../../../../tools/utils/io/writeAsteroidNames';
import { parseAsteroidCatalog } from '../../../../src/layers/asteroids/catalog/load/parseAsteroidCatalog';
import { parseAsteroidNames } from '../../../../src/layers/asteroids/catalog/load/parseAsteroidNames';
import type { LoadedAsteroids } from '../../../../src/layers/asteroids/catalog/@types/LoadedAsteroids';

export const FIXTURE_EPOCH_JD = 2461200.5;

const row = (number: number, name: string | null, h: number | null): MpcorbRow => ({
  number,
  h,
  g: 0.15,
  epochJd: FIXTURE_EPOCH_JD,
  meanAnomalyDeg: 40 * number,
  argPeriDeg: 70 + number,
  nodeDeg: 100 + number,
  inclDeg: 5 + number,
  e: 0.05 * number,
  aAu: 2 + 0.2 * number,
  asteroidClass: 'mainBelt',
  name,
});

const ROWS = [
  row(1, 'Ceres', 3.3),
  row(2, 'Pallas', 4.1),
  row(3, null, null),
  row(4, 'Vesta', 3.2),
  row(5, 'Astraea', 6.9),
];

export function loadedAsteroids(): LoadedAsteroids {
  const catalog = parseAsteroidCatalog(
    writeAsteroidCatalog(ROWS, FIXTURE_EPOCH_JD).bytes.slice().buffer,
  );
  const named = ROWS.flatMap((r) => (r.name === null ? [] : [{ number: r.number, name: r.name }]));
  return { catalog, names: parseAsteroidNames(writeAsteroidNames(named).slice().buffer) };
}
