import { describe, it, expect } from 'vitest';
import { parseWsoSynopticChart } from '../../../tools/parsers/parseWsoSynopticChart';

const values = (start: number, count: number): string =>
  Array.from({ length: count }, (_, i) => (start + i).toFixed(3)).join('   ');

// Wrapped like upstream: first line carries 6 values, the rest spread over later lines.
const block = (lon: number, start: number, count = 30): string =>
  `CT2300:${lon}   ${values(start, Math.min(6, count))}\n` +
  (count > 6 ? `    ${values(start + 6, count - 6)}\n` : '');

describe('parseWsoSynopticChart', () => {
  it('reads a 30-value block that wraps over lines, in latitude order', () => {
    const chart = parseWsoSynopticChart(`header line\n${block(355, -2)}`);
    const column = chart.get(355)!;
    expect(column).toHaveLength(30);
    expect(column[0]).toBe(-2);
    expect(column[29]).toBe(27);
  });

  it('folds longitude 360 onto 0', () => {
    const chart = parseWsoSynopticChart(block(360, 1));
    expect([...chart.keys()]).toEqual([0]);
  });

  it('skips a block with fewer than 30 values without dropping its neighbours', () => {
    const chart = parseWsoSynopticChart(
      `${block(360, 1)}${block(355, 1, 12)}${block(350, 1)}`.replace(/\n$/, ''),
    );
    expect([...chart.keys()].sort((a, b) => a - b)).toEqual([0, 350]);
  });

  it('returns an empty map for a rotation past the end of the dataset', () => {
    expect(parseWsoSynopticChart('SS250_R: Start time after end of dataset\n').size).toBe(0);
  });
});
