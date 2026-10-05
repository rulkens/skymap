import { describe, it, expect } from 'vitest';
import { parseWsoRotationStarts } from '../../../tools/parsers/parseWsoRotationStarts';

const HTML = `<pre>
CR 1642  1976:05:27 15h\t  6.8\t 4.7
CR 1643  1976:06:23 22h\t  7.1\t 5.0
</pre>`;

describe('parseWsoRotationStarts', () => {
  it('reads the start as UTC days since the Unix epoch, independent of the local timezone', () => {
    const starts = parseWsoRotationStarts(HTML);
    expect(starts.get(1642)).toBe(Date.UTC(1976, 4, 27, 15) / 86_400_000);
    expect(starts.get(1643)).toBe(Date.UTC(1976, 5, 23, 22) / 86_400_000);
  });

  it('ignores rows that are not rotation starts', () => {
    expect(parseWsoRotationStarts('<td>Carrington</td> CR header').size).toBe(0);
  });
});
