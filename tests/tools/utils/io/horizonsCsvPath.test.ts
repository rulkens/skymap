import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { horizonsCsvPath } from '../../../../tools/utils/io/horizonsCsvPath';
import { rawDataPath } from '../../../../tools/utils/io/rawDataRegistry';

describe('horizonsCsvPath', () => {
  it('names the file by the body id, never the Horizons query', () => {
    expect(horizonsCsvPath({ id: '2026-qq8', centre: '500@10' })).toBe(
      join(rawDataPath('horizons'), '500@10', '2026-qq8.csv'),
    );
  });

  it('puts a suffix between the id and the extension', () => {
    expect(horizonsCsvPath({ id: 'voyager1', centre: '500@10' }, '.dense')).toBe(
      join(rawDataPath('horizons'), '500@10', 'voyager1.dense.csv'),
    );
  });
});
