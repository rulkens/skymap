import { describe, expect, it } from 'vitest';
import { syncProgressDetail } from '../../src/utils/syncProgressDetail';

describe('syncProgressDetail', () => {
  it('names the group, the bytes and a rounded percentage', () => {
    expect(syncProgressDetail({ group: 'Galaxies', doneBytes: 1.25e9, totalBytes: 5e9 })).toBe(
      'Galaxies · 1.3 GB of 5.0 GB · 25%',
    );
  });

  it('an empty total reads 0% rather than NaN', () => {
    expect(syncProgressDetail({ group: 'Stars', doneBytes: 0, totalBytes: 0 })).toMatch(/· 0%$/);
  });
});
