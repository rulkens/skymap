/**
 * The pooled galaxy record against the flat interleave: one galaxy built both ways must
 * decode (as `pooledVertex.wesl` does) to the flat slots within the wire's quantisation.
 */
import { describe, it, expect } from 'vitest';

import { packGalaxyGpuRecords } from '../../../src/utils/galaxy/packGalaxyGpuRecords';
import { buildPointInterleavedBuffer } from '../../../src/services/engine/bake/buildPointInterleavedBuffer';
import { GALAXY_COLUMN_SCHEMA } from '../../../src/data/octree/galaxyOctreeFamily';
import { NO_CHUNK_REF } from '../../../src/data/octree/octreeFormat';
import { pickColourIndex } from '../../../src/data/galaxyCatalog/colourIndex';
import { Source } from '../../../src/data/sources';
import { absoluteFromApparent } from '../../../src/utils/math/absoluteFromApparent';
import { f16ToFloat } from '../../../src/utils/math/f16ToFloat';
import { mortonEncode3 } from '../../../src/utils/math/mortonEncode3';
import { makeGalaxyCatalog } from '../../fixtures/makeGalaxyCatalog';
import type { ColumnId } from '../../../src/@types/octree/ColumnId';
import type { GalaxyColumns } from '../../../src/@types/data/galaxyCatalog/GalaxyColumns';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { OctreeGrid } from '../../../src/@types/octree/OctreeGrid';

const STATS = { magOffset: 0.4, medianAbsMag: -20 };
const GRID: OctreeGrid = { bits: 10, origin: [-100, -100, -100], cellEdge: 0.5 };
const LEVEL = 3;
const COLUMNS = GALAXY_COLUMN_SCHEMA;
const q = (id: ColumnId) => COLUMNS.find((c) => c.id === id)!;
/** What the decoder hands the runtime: `q0 + code·q1` of the quantised value. */
const wire = (id: ColumnId, v: number) => {
  const { q0, q1 } = q(id);
  const code = Math.min(255, Math.max(0, Math.round((v - q0) / q1))) || 0;
  return Math.fround(q0 + code * q1);
};

type Galaxy = {
  pos: [number, number, number];
  magG: number;
  magR: number;
  axisRatio: number;
  pa: number;
  diameterKpc: number;
  orientationFallback: boolean;
  diameterFallback: boolean;
};

function flat(g: Galaxy): Float32Array {
  const cloud: GalaxyCatalog = makeGalaxyCatalog(1, {
    positions: Float32Array.from(g.pos),
    magG: Float32Array.of(g.magG),
    magR: Float32Array.of(g.magR),
    axisRatio: Float32Array.of(g.axisRatio),
    positionAngleDeg: Float32Array.of(g.pa),
    diameterKpc: Float32Array.of(g.diameterKpc),
    orientationIsFallback: Uint8Array.of(g.orientationFallback ? 1 : 0),
    diameterIsFallback: Uint8Array.of(g.diameterFallback ? 1 : 0),
  });
  return buildPointInterleavedBuffer({ cloud, source: Source.Glade, stats: STATS }).interleaved;
}

/** The same galaxy as a one-row, one-record chunk, its columns as the emitter bakes them. */
function packed(g: Galaxy): Uint32Array {
  const edge = GRID.cellEdge * 2 ** LEVEL;
  const cell = g.pos.map((p, a) => Math.floor((p - GRID.origin[a]!) / edge));
  const offset = Uint16Array.from(g.pos, (p, a) =>
    Math.round(((p - GRID.origin[a]! - cell[a]! * edge) / edge) * 65536),
  );
  const d = Math.hypot(...g.pos);
  const records: GalaxyColumns = {
    count: 1,
    offset,
    absMag: Float32Array.of(wire('absMag', absoluteFromApparent(g.magG + STATS.magOffset, d))),
    colourIndex: Float32Array.of(
      wire('colourIndex', pickColourIndex(Source.Glade, NaN, g.magG, g.magR, NaN, NaN, d)),
    ),
    axisRatio: Float32Array.of(wire('axisRatio', g.axisRatio)),
    pa: Float32Array.of(wire('pa', g.pa)),
    logSize: Float32Array.of(wire('logSize', Math.log10(g.diameterKpc))),
    flags: Float32Array.of((g.orientationFallback ? 1 : 0) | (g.diameterFallback ? 2 : 0)),
    angularWeight: Float32Array.of(wire('angularWeight', 0)),
  };
  const nodes = {
    count: 1,
    morton: Uint32Array.of(mortonEncode3(cell[0]!, cell[1]!, cell[2]!)),
    level: Uint8Array.of(LEVEL),
    childMask: Uint8Array.of(0),
    firstRecord: Uint32Array.of(0),
    ownCount: Uint32Array.of(1),
    blobCount: Uint32Array.of(0),
    chunkRef: Uint32Array.of(NO_CHUNK_REF),
  };
  const out = new Uint32Array(6 * 2);
  packGalaxyGpuRecords(
    { nodes, records },
    { family: 'galaxy', grid: GRID, columns: COLUMNS },
    STATS,
    out,
    1,
  );
  return out.subarray(6);
}

/** `pooledVertex.wesl`'s decode of the fields the flat slots also carry. */
function decode(w: Uint32Array) {
  const f32 = new Float32Array(w.buffer, w.byteOffset, 6);
  const flags = (w[2]! >>> 16) & 0xff;
  const ar = (w[2]! & 0xff) * q('axisRatio').q1;
  return {
    absMag: q('absMag').q0 + ((w[1]! >>> 16) & 0xff) * q('absMag').q1,
    colourIndex: (w[1]! >>> 24) * q('colourIndex').q1,
    axisRatio: flags & 1 ? -ar : ar,
    paCos: f16ToFloat(w[3]! & 0xffff),
    paSin: f16ToFloat(w[3]! >>> 16),
    magnitude: f16ToFloat(w[4]! & 0xffff),
    sbAmp: f16ToFloat(w[4]! >>> 16),
    radiusMpc: f32[5]!,
  };
}

const SPIRAL: Galaxy = {
  pos: [30.3, -12.1, 7.7],
  magG: 14.2,
  magR: 12.9,
  axisRatio: 0.63,
  pa: 37,
  diameterKpc: 24,
  orientationFallback: false,
  diameterFallback: false,
};

describe('packGalaxyGpuRecords', () => {
  it("the packed record decodes to the flat interleave's slots for the same galaxy", () => {
    const s = flat(SPIRAL);
    const p = decode(packed(SPIRAL));
    expect(p.magnitude).toBeCloseTo(s[3]!, 1);
    expect(p.colourIndex).toBeCloseTo(s[4]!, 2);
    expect(p.axisRatio).toBeCloseTo(s[5]!, 2);
    expect(p.paCos).toBeCloseTo(s[6]!, 2);
    expect(p.paSin).toBeCloseTo(s[7]!, 2);
    expect(p.radiusMpc / s[8]!).toBeCloseTo(1, 1);
    expect(p.absMag).toBeCloseTo(s[10]!, 1);
    expect(p.sbAmp / s[11]!).toBeCloseTo(1, 1);
  });

  it('re-quantised u8 fields equal the wire codes', () => {
    const codes = Uint8Array.from({ length: 256 }, (_, i) => i);
    const dq = (id: ColumnId) =>
      Float32Array.from(codes, (c) => Math.fround(q(id).q0 + c * q(id).q1));
    const n = codes.length;
    const records: GalaxyColumns = {
      count: n,
      offset: new Uint16Array(3 * n),
      absMag: dq('absMag'),
      colourIndex: dq('colourIndex'),
      axisRatio: dq('axisRatio'),
      pa: new Float32Array(n),
      logSize: new Float32Array(n),
      flags: dq('flags'),
      angularWeight: dq('angularWeight'),
    };
    const nodes = {
      count: 1,
      morton: Uint32Array.of(0),
      level: Uint8Array.of(0),
      childMask: Uint8Array.of(0),
      firstRecord: Uint32Array.of(0),
      ownCount: Uint32Array.of(n),
      blobCount: Uint32Array.of(0),
      chunkRef: Uint32Array.of(NO_CHUNK_REF),
    };
    const out = new Uint32Array(6 * n);
    packGalaxyGpuRecords(
      { nodes, records },
      { family: 'galaxy', grid: { ...GRID, origin: [1, 1, 1] }, columns: COLUMNS },
      STATS,
      out,
      0,
    );
    const field = (word: number, shift: number) =>
      Array.from(codes, (_, r) => (out[6 * r + word]! >>> shift) & 0xff);
    expect(field(1, 16)).toEqual([...codes]);
    expect(field(1, 24)).toEqual([...codes]);
    expect(field(2, 0)).toEqual([...codes]);
    expect(field(2, 8)).toEqual([...codes]);
    expect(field(2, 16)).toEqual([...codes]);
  });

  it('NaN axis ratio and fallback flags give the same signs as the flat interleave', () => {
    const odd: Galaxy = {
      ...SPIRAL,
      axisRatio: NaN,
      orientationFallback: true,
      diameterFallback: true,
    };
    const s = flat(odd);
    const p = decode(packed(odd));
    // The vertex body reads 'axisRatio < 0' as estimated and 'abs(axisRatio) > 0' as an ellipse.
    expect(p.axisRatio < 0).toBe(s[5]! < 0);
    expect(Math.abs(p.axisRatio) > 0).toBe(Math.abs(s[5]!) > 0);
    expect(Math.sign(p.radiusMpc)).toBe(Math.sign(s[8]!));
    expect(p.radiusMpc).toBeLessThan(0);
  });
});
