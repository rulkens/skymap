/**
 * The pooled galaxy record is the wire codes bit-copied: each field must come back as its
 * code at the word and shift `pooledVertex.wesl` reads it from (the derivation is the
 * shader's, pinned by `pooledFields.parity.test.ts`).
 */
import { describe, it, expect } from 'vitest';

import { packGalaxyGpuRecords } from '../../../src/utils/galaxy/packGalaxyGpuRecords';
import { GALAXY_COLUMN_SCHEMA } from '../../../src/data/octree/galaxyOctreeFamily';
import { GALAXY_GPU_RECORD_WORDS } from '../../../src/data/galaxyCatalog/galaxyGpuRecordWords';
import type { ColumnId } from '../../../src/@types/octree/ColumnId';
import type { GalaxyColumns } from '../../../src/@types/data/galaxyCatalog/GalaxyColumns';

const W = GALAXY_GPU_RECORD_WORDS;
const q = (id: ColumnId) => GALAXY_COLUMN_SCHEMA.find((c) => c.id === id)!;

describe('packGalaxyGpuRecords', () => {
  it('every u8 field is its wire code, and the offsets are copied, at the shader-read places', () => {
    const n = 256;
    // Each column a different rotation of the codes, so a field read from a neighbour's place fails.
    const codeOf = (r: number, k: number) => (r + 37 * k) & 0xff;
    const dq = (id: ColumnId, k: number) =>
      Float32Array.from({ length: n }, (_, r) => Math.fround(q(id).q0 + codeOf(r, k) * q(id).q1));
    const records: GalaxyColumns = {
      count: n,
      offset: Uint16Array.from({ length: 3 * n }, (_, i) => (i * 257) & 0xffff),
      absMag: dq('absMag', 1),
      colourIndex: dq('colourIndex', 2),
      axisRatio: dq('axisRatio', 3),
      angularWeight: dq('angularWeight', 4),
      flags: dq('flags', 5),
      pa: dq('pa', 6),
      logSize: dq('logSize', 7),
    };
    const out = new Uint32Array(W * (n + 1));
    packGalaxyGpuRecords(records, GALAXY_COLUMN_SCHEMA, out, 1);
    const field = (word: number, shift: number, mask = 0xff) =>
      Array.from({ length: n }, (_, r) => (out[W * (r + 1) + word]! >>> shift) & mask);
    const want = (k: number) => Array.from({ length: n }, (_, r) => codeOf(r, k));
    const offsets = (a: number) => Array.from({ length: n }, (_, r) => records.offset[3 * r + a]);

    expect(field(0, 0, 0xffff)).toEqual(offsets(0));
    expect(field(0, 16, 0xffff)).toEqual(offsets(1));
    expect(field(1, 0, 0xffff)).toEqual(offsets(2));
    expect(field(1, 16)).toEqual(want(1));
    expect(field(1, 24)).toEqual(want(2));
    expect(field(2, 0)).toEqual(want(3));
    expect(field(2, 8)).toEqual(want(4));
    expect(field(2, 16)).toEqual(want(5));
    expect(field(2, 24)).toEqual(want(6));
    expect(field(3, 0, 0xffffffff)).toEqual(want(7));
    // `at` places the records: the slot before them is untouched.
    expect([...out.subarray(0, W)]).toEqual([0, 0, 0, 0]);
  });
});
