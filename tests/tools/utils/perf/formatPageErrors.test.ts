/**
 * formatPageErrors — the shared ⚠ page-error summary, now used by BOTH
 * formatReport and formatSweep. The test pins the de-duplication (one counted
 * line per unique message), the empty-input contract (no lines at all), and the
 * colour-injection contract (with the palette off there are no escape bytes, so
 * piped/JSON output stays clean).
 */

import { describe, it, expect } from 'vitest';

import { formatPageErrors } from '../../../../tools/utils/perf/formatPageErrors';
import { ansiPalette } from '../../../../tools/utils/cli/ansiPalette';

const plain = ansiPalette(false);

describe('formatPageErrors', () => {
  it('de-duplicates messages into one counted line each', () => {
    const lines = formatPageErrors(['E', 'E', 'F'], plain);
    expect(lines).toHaveLength(2);
    expect(lines.some((l) => l.includes('E') && l.includes('2'))).toBe(true);
    expect(lines.some((l) => l.includes('F') && l.includes('1'))).toBe(true);
    expect(lines.every((l) => l.includes('⚠'))).toBe(true);
  });

  it('returns an empty array when there are no errors', () => {
    expect(formatPageErrors([], plain)).toEqual([]);
  });

  it('emits no ANSI escapes when the palette is disabled', () => {
    const lines = formatPageErrors(['boom'], plain);
    expect(lines.join('\n')).not.toContain('\x1b');
  });
});
