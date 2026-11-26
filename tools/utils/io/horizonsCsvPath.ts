import { join } from 'node:path';

import type { HorizonsBody } from '../../bodies/@types/HorizonsBody';
import { rawDataPath } from './rawDataRegistry';

/** A body's raw Horizons file against `centre`, named by its id: the query (`DES=2026 QQ8;`) is no file name. */
export function horizonsCsvPath(body: Pick<HorizonsBody, 'id' | 'centre'>, suffix = ''): string {
  return join(rawDataPath('horizons'), body.centre, `${body.id}${suffix}.csv`);
}
