import { describe, it, expect } from 'vitest';
import { encodeFilaments, decodeFilaments } from '../../src/data/filamentBinaryFormat';
import type { FilamentCloud } from '../../src/@types/data/FilamentCloud';

function makeFixture(): FilamentCloud {
  // Two strips: A has 3 vertices, B has 2.  Total 5 vertices.
  return {
    stripCount: 2,
    vertexCount: 5,
    stripOffsets: new Uint32Array([0, 3, 5]),
    vertices: new Float32Array([
      10, 20, 30, 0.9, 11, 21, 31, 0.8, 12, 22, 32, 0.7, 40, 50, 60, 0.6, 41, 51, 61, 0.5,
    ]),
  };
}

describe('filament binary format (FILA v1)', () => {
  it('round-trips a small cloud byte-for-byte', () => {
    const original = makeFixture();
    const decoded = decodeFilaments(encodeFilaments(original));
    expect(decoded.stripCount).toBe(2);
    expect(decoded.vertexCount).toBe(5);
    expect(Array.from(decoded.stripOffsets)).toEqual([0, 3, 5]);
    expect(Array.from(decoded.vertices)).toEqual(Array.from(original.vertices));
  });

  it('round-trips an empty cloud', () => {
    // Edge case: a catalog filtered down to zero filaments must still
    // serialise cleanly.  The offset table degenerates to a single [0]
    // entry (the exclusive-scan invariant: offsets[stripCount] === vertexCount,
    // and both are zero).  An accidental "off by one" in encode/decode would
    // surface here as a length mismatch that bypasses every other test.
    const original: FilamentCloud = {
      stripCount: 0,
      vertexCount: 0,
      stripOffsets: new Uint32Array([0]),
      vertices: new Float32Array(0),
    };
    const decoded = decodeFilaments(encodeFilaments(original));
    expect(decoded.stripCount).toBe(0);
    expect(decoded.vertexCount).toBe(0);
    expect(Array.from(decoded.stripOffsets)).toEqual([0]);
    expect(decoded.vertices.length).toBe(0);
  });

  it('produces the expected byte length', () => {
    // header 16 + (stripCount+1)*4 + vertexCount*16 = 16 + 12 + 80 = 108
    const buf = encodeFilaments(makeFixture());
    expect(buf.byteLength).toBe(108);
  });

  it('rejects bad magic', () => {
    const buf = new ArrayBuffer(16);
    expect(() => decodeFilaments(buf)).toThrow(/magic/);
  });

  it('rejects unsupported version with regenerate hint', () => {
    const cloud = makeFixture();
    const buf = encodeFilaments(cloud);
    new DataView(buf).setUint32(4, 99, true); // overwrite version
    expect(() => decodeFilaments(buf)).toThrow(/version/);
    expect(() => decodeFilaments(buf)).toThrow(/build-filaments/);
  });

  it('throws when stripOffsets length disagrees with stripCount+1', () => {
    const cloud: FilamentCloud = {
      stripCount: 2,
      vertexCount: 5,
      stripOffsets: new Uint32Array([0, 3]), // wrong length
      vertices: new Float32Array(20),
    };
    expect(() => encodeFilaments(cloud)).toThrow(/stripOffsets length/);
  });
});
