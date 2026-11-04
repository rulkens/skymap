import { describe, expect, it } from 'vitest';
import { syncProgressDetail } from '../../../../src/control/sync/utils/syncProgressDetail';

describe('syncProgressDetail', () => {
  it('names the bytes done, the bytes left and, once known, the time left', () => {
    const progress = { group: 'Galaxies', doneBytes: 1.25e9, totalBytes: 5e9 };
    expect(syncProgressDetail(progress, null)).toBe('1.3 GB of 5.0 GB · 3.8 GB left');
    expect(syncProgressDetail(progress, 330)).toBe('1.3 GB of 5.0 GB · 3.8 GB left, about 6 min');
  });
});
