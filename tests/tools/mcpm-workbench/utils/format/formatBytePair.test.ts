/** formatBytePair — used and max in one unit, picked by the max, so they compare at a glance. */
import { describe, expect, it } from 'vitest';
import { formatBytePair } from '../../../../../tools/mcpm-workbench/src/utils/format/formatBytePair';

describe('formatBytePair', () => {
  it('a gigabyte limit puts a smaller buffer in GB too', () => {
    expect(formatBytePair(80.5 * 1024 ** 2, 2 * 1024 ** 3)).toBe('0.1 / 2.0 GB');
  });

  it('a limit under a gigabyte reads in MB', () => {
    expect(formatBytePair(80.5 * 1024 ** 2, 128 * 1024 ** 2)).toBe('81 / 128 MB');
  });
});
