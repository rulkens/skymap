/**
 * expectSigRows — compare a golden step's number columns element by element.
 * Both sides came through `goldenSig`, so the match is exact; the per-element
 * assertion is what names the column and index of the FIRST drift instead of
 * dumping two long arrays.
 */

import { expect } from 'vitest';

export function expectSigRows(
  rows: readonly (readonly [string, readonly number[], readonly number[]])[],
  at: string,
): void {
  for (const [name, got, exp] of rows) {
    expect(got.length, `${at} ${name}`).toBe(exp.length);
    got.forEach((g, k) => expect(g, `${at} ${name}[${k}]`).toBe(exp[k]!));
  }
}
