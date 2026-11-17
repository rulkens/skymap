/**
 * The bake's writer and the runtime's reader agree on the antique Earth map's
 * bytes: counts, level-sorted strip prefixes, the strip-end flag the line
 * shader culls on, and the style words' bit fields.
 */

import { describe, it, expect } from 'vitest';

import { encodeAntiqueEarthMap } from '../../../../../tools/antique/earth/utils/encodeAntiqueEarthMap';
import { decodeAntiqueEarthMap } from '../../../../../src/layers/body/earth/antiqueMap/load/decodeAntiqueEarthMap';
import type { BakedStrip } from '../../../../../tools/antique/earth/@types/BakedStrip';

const strip = (level: number, kind: number, lonDeg: number, n: number): BakedStrip => ({
  points: Array.from({ length: n }, (_, i) => ({
    lonDeg,
    latDeg: i,
    arcKm: i * 111,
    widthUnits: 1.5,
  })),
  kind,
  level,
});

describe('encodeAntiqueEarthMap', () => {
  it('round-trips through the runtime decoder with strips sorted by reveal level', () => {
    const bytes = encodeAntiqueEarthMap({
      fill: {
        positions: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
        codes: new Uint8Array([3, 3, 3]),
        indices: new Uint32Array([0, 1, 2]),
      },
      strips: [strip(3, 2, 10, 3), strip(0, 0, 20, 2)],
      signs: [{ lonDeg: 90, latDeg: 45, sizeUnits: 6.25, kind: 8, level: 5 }],
    });
    const map = decodeAntiqueEarthMap(bytes.slice().buffer);

    expect(new Float32Array(map.fillVertices.slice().buffer)).toEqual(
      new Float32Array([1, 0, 0, 3, 0, 1, 0, 3, 0, 0, 1, 3]),
    );
    expect(map.lineLevelEnds).toEqual([2, 2, 2, 5, 5, 5, 5, 5]);
    const floats = new Float32Array(map.lineVertices.slice().buffer);
    const words = new Uint32Array(map.lineVertices.slice().buffer);
    // The level-0 strip comes first, in radians; its second vertex ends the strip.
    expect(floats[0]).toBeCloseTo((20 * Math.PI) / 180, 6);
    expect(words[3]).toBe(48 | (0 << 8) | (0 << 12));
    expect(words[4 + 3]).toBe(48 | (1 << 16));
    expect(words[8 + 3]).toBe(48 | (2 << 8) | (3 << 12));
    expect(words[16 + 3]! & (1 << 16)).not.toBe(0);
    expect(floats[16 + 2]).toBe(222);

    expect(map.signCount).toBe(1);
    const signWords = new Uint32Array(map.signs.slice().buffer);
    expect(signWords[2]).toBe(25 | (8 << 8) | (5 << 16));
  });

  it('refuses a file from another version', () => {
    const bytes = encodeAntiqueEarthMap({
      fill: { positions: new Float32Array(), codes: new Uint8Array(), indices: new Uint32Array() },
      strips: [],
      signs: [],
    });
    new Uint32Array(bytes.buffer)[1] = 99;
    expect(() => decodeAntiqueEarthMap(bytes.buffer as ArrayBuffer)).toThrow(/unsupported version/);
  });
});
