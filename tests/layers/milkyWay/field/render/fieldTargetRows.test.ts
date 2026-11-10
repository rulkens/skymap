import { describe, expect, it } from 'vitest';

import { FIELD_TARGET_ROWS } from '../../../../../src/layers/milkyWay/field/render/fieldTargetRows';
import { fieldTargetRowId } from '../../../../../src/layers/milkyWay/field/utils/fieldTargetRowId';

describe('FIELD_TARGET_ROWS', () => {
  // Nothing in the app draws extras; the row cost ~66 MB at 4K for nothing.
  it('allocates no extras target in the app', () => {
    expect(FIELD_TARGET_ROWS.map((row) => row.id)).not.toContain(fieldTargetRowId('extras'));
  });
});
