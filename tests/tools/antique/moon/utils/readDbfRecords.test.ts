/**
 * A dBASE table read by its header's lengths: fields split at their widths, text
 * trimmed, and a deleted record ('*' flag) skipped rather than shifting the rest.
 */

import { describe, it, expect } from 'vitest';

import { readDbfRecords } from '../../../../../tools/antique/moon/utils/readDbfRecords';

function dbf(
  fields: [string, number][],
  rows: { deleted: boolean; values: string[] }[],
): Uint8Array {
  const headerLength = 32 + 32 * fields.length + 1;
  const recordLength = 1 + fields.reduce((n, [, len]) => n + len, 0);
  const bytes = new Uint8Array(headerLength + recordLength * rows.length + 1);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, rows.length, true);
  view.setUint16(8, headerLength, true);
  view.setUint16(10, recordLength, true);
  fields.forEach(([name, len], i) => {
    bytes.set(new TextEncoder().encode(name), 32 + 32 * i);
    bytes[32 + 32 * i + 11] = 0x43;
    bytes[32 + 32 * i + 16] = len;
  });
  bytes[headerLength - 1] = 0x0d;
  rows.forEach((row, r) => {
    let at = headerLength + r * recordLength;
    bytes[at++] = row.deleted ? 0x2a : 0x20;
    row.values.forEach((v, i) => {
      bytes.set(new TextEncoder().encode(v.padEnd(fields[i]![1])), at);
      at += fields[i]![1];
    });
  });
  return bytes;
}

describe('readDbfRecords', () => {
  it('splits records at the field widths and skips deleted ones', () => {
    const bytes = dbf(
      [
        ['name', 12],
        ['diameter', 8],
      ],
      [
        { deleted: false, values: ['Tycho', '85.29'] },
        { deleted: true, values: ['Gone', '1'] },
        { deleted: false, values: ['Copernicus', '96.07'] },
      ],
    );
    expect(readDbfRecords(bytes)).toEqual([
      { name: 'Tycho', diameter: '85.29' },
      { name: 'Copernicus', diameter: '96.07' },
    ]);
  });
});
