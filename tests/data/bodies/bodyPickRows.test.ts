/**
 * The pack/unpack scan is a first-match lookup, so a duplicate id across rows
 * would silently make one row unpickable — this pins that invariant.
 */

import { describe, expect, it } from 'vitest';
import { BODY_PICK_ROWS } from '../../../src/data/bodies/bodyPickRows';

describe('BODY_PICK_ROWS', () => {
  it("no id appears in two rows' seed tables", () => {
    const ids = Object.values(BODY_PICK_ROWS).flatMap((row) => row.map((seed) => seed.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
