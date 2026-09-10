/**
 * splats.bin is the binary contract between the offline bake (packSplats,
 * Node) and the browser viewer (parseSplats) — these tests exercise both
 * ends together, decoding with a hand-written DataView so a stride, word
 * or field-order slip on either side shows up as a wrong value, not a
 * pass.  The f16 decode goes through `f16BitsToFloat`, a separate
 * implementation from the packer's `f32ToF16Bits`, keeping the logScale
 * assertions a round-trip rather than a mirror of the encoder.
 */
import { describe, it, expect } from 'vitest';
import {
  packSplats,
  type GaussianSplatRecord,
} from '../../../../tools/scene-recon/pack/packSplats';
import { parseSplats } from '../../../../tools/scene-workbench/src/scene/parseSplats';
import {
  SPLATS_HEADER_BYTES,
  SPLATS_RECORD_BYTES,
  SPLATS_SH1_RECORD_BYTES,
} from '../../../../tools/scene-recon/pack/splatFormat';
import { f16BitsToFloat } from '../../../../tools/utils/math/f16BitsToFloat';

const FIVE_SPLATS: readonly GaussianSplatRecord[] = [
  {
    xM: 12.5,
    yM: -3.25,
    zM: 100.0,
    rotation: [0.1, -0.2, 0.3, 0.927],
    logScale: [-2.5, -3.75, -1.125],
    opacity: 0.5,
    dcColor: [10, 20, 30],
    fRest: null,
  },
  {
    xM: -450.75,
    yM: 8.0,
    zM: -1.5,
    rotation: [-0.5, 0.5, -0.5, 0.5],
    logScale: [0.25, -0.5, 1.75],
    opacity: 0.0,
    dcColor: [200, 5, 250],
    fRest: null,
  },
  {
    xM: 0.125,
    yM: 0.0,
    zM: 999.999,
    rotation: [0.0, 0.0, 0.0, 1.0],
    logScale: [-6.5, -7.25, -8.0],
    opacity: 1.0,
    dcColor: [1, 254, 128],
    fRest: null,
  },
  {
    xM: 3000.0,
    yM: -3000.0,
    zM: 0.5,
    rotation: [0.707, 0.0, -0.707, 0.0],
    logScale: [2.5, 3.25, -4.5],
    opacity: 0.25,
    dcColor: [77, 88, 99],
    fRest: null,
  },
  {
    xM: -0.001,
    yM: 42.42,
    zM: -777.7,
    rotation: [-0.25, 0.75, 0.125, -0.6],
    logScale: [-1.5, 0.75, -0.25],
    opacity: 0.875,
    dcColor: [255, 0, 17],
    fRest: null,
  },
];

/** Same five splats, each carrying nine distinct fRest coefficients in [-1, 1]. */
const FIVE_SPLATS_SH1: readonly GaussianSplatRecord[] = FIVE_SPLATS.map((splat, i) => ({
  ...splat,
  fRest: Array.from({ length: 9 }, (_unused, k) => (i * 9 + k - 22) / 23),
}));

function recordView(records: Uint8Array): DataView {
  return new DataView(records.buffer, records.byteOffset, records.byteLength);
}

describe('packSplats → parseSplats round-trips a shDegree-0 record set', () => {
  it('decodes every core field of every record back to the packed input', () => {
    const buffer = packSplats(FIVE_SPLATS, 0).buffer as ArrayBuffer;

    const parsed = parseSplats(buffer);
    expect(parsed.splatCount).toBe(FIVE_SPLATS.length);
    expect(parsed.shDegree).toBe(0);
    expect(parsed.sh1).toBeNull();
    expect(parsed.records.buffer).toBe(buffer); // view, not a re-packed copy
    expect(buffer.byteLength).toBe(SPLATS_HEADER_BYTES + FIVE_SPLATS.length * SPLATS_RECORD_BYTES);

    const dv = recordView(parsed.records);
    FIVE_SPLATS.forEach((splat, i) => {
      const o = i * SPLATS_RECORD_BYTES;
      expect(dv.getFloat32(o + 0, true)).toBeCloseTo(splat.xM, 2);
      expect(dv.getFloat32(o + 4, true)).toBeCloseTo(splat.yM, 2);
      expect(dv.getFloat32(o + 8, true)).toBeCloseTo(splat.zM, 2);
      for (let c = 0; c < 4; c++) {
        expect(dv.getInt8(o + 12 + c) / 127).toBeCloseTo(splat.rotation[c]!, 2);
      }
      expect(f16BitsToFloat(dv.getUint16(o + 16, true))).toBeCloseTo(splat.logScale[0], 2);
      expect(f16BitsToFloat(dv.getUint16(o + 18, true))).toBeCloseTo(splat.logScale[1], 2);
      expect(f16BitsToFloat(dv.getUint16(o + 20, true))).toBeCloseTo(splat.logScale[2], 2);
      expect(dv.getUint8(o + 22) / 255).toBeCloseTo(splat.opacity, 2);
      expect(dv.getUint8(o + 24)).toBe(splat.dcColor[0]);
      expect(dv.getUint8(o + 25)).toBe(splat.dcColor[1]);
      expect(dv.getUint8(o + 26)).toBe(splat.dcColor[2]);

      // positionsM is the one field parseSplats decodes itself — a stride
      // slip there would be invisible in the record view above.
      expect(parsed.positionsM[i * 3 + 0]).toBeCloseTo(splat.xM, 2);
      expect(parsed.positionsM[i * 3 + 1]).toBeCloseTo(splat.yM, 2);
      expect(parsed.positionsM[i * 3 + 2]).toBeCloseTo(splat.zM, 2);
    });
  });
});

describe('packSplats → parseSplats round-trips a shDegree-1 record set', () => {
  it('decodes the trailing fRest block channel-major, three coefficients per word', () => {
    const buffer = packSplats(FIVE_SPLATS_SH1, 1).buffer as ArrayBuffer;

    const parsed = parseSplats(buffer);
    expect(parsed.shDegree).toBe(1);
    expect(parsed.records.byteLength).toBe(FIVE_SPLATS_SH1.length * SPLATS_RECORD_BYTES);
    expect(parsed.sh1?.byteLength).toBe(FIVE_SPLATS_SH1.length * SPLATS_SH1_RECORD_BYTES);

    // The core records must be byte-identical to the degree-0 packing —
    // the fRest block is appended, never interleaved.
    const core = recordView(parsed.records);
    FIVE_SPLATS_SH1.forEach((splat, i) => {
      const o = i * SPLATS_RECORD_BYTES;
      expect(core.getFloat32(o + 0, true)).toBeCloseTo(splat.xM, 2);
      expect(core.getUint8(o + 22) / 255).toBeCloseTo(splat.opacity, 2);
    });

    const sh1 = recordView(parsed.sh1!);
    FIVE_SPLATS_SH1.forEach((splat, i) => {
      const base = i * SPLATS_SH1_RECORD_BYTES;
      for (let channel = 0; channel < 3; channel++) {
        for (let k = 0; k < 3; k++) {
          // Channel-major: R[0..2] pad, G[0..2] pad, B[0..2] pad.
          const byte = base + channel * 4 + k;
          expect(sh1.getInt8(byte) / 127).toBeCloseTo(splat.fRest![channel * 3 + k]!, 2);
        }
      }
    });
  });
});

describe('parseSplats rejects a buffer whose length disagrees with the header', () => {
  it('throws when records or the fRest block are missing', () => {
    const full = packSplats(FIVE_SPLATS, 0).buffer as ArrayBuffer;
    const truncated = full.slice(0, SPLATS_HEADER_BYTES + 2 * SPLATS_RECORD_BYTES);
    expect(() => parseSplats(truncated)).toThrow(/splatCount|length/i);

    // shDegree 1 with the trailing block lopped off: the core records are
    // all present, so only a size formula that accounts for sh1 catches it.
    const sh1Buffer = packSplats(FIVE_SPLATS_SH1, 1).buffer as ArrayBuffer;
    const noTrailing = sh1Buffer.slice(
      0,
      SPLATS_HEADER_BYTES + FIVE_SPLATS_SH1.length * SPLATS_RECORD_BYTES,
    );
    expect(() => parseSplats(noTrailing)).toThrow(/splatCount|length/i);

    // Shorter than the 16-byte header itself — splatCount can't even be read.
    expect(() => parseSplats(new ArrayBuffer(8))).toThrow();
  });
});

describe('parseSplats rejects a wrong magic', () => {
  it('throws when the magic bytes do not match SPL3', () => {
    const buffer = packSplats(FIVE_SPLATS, 0).buffer as ArrayBuffer;
    new DataView(buffer).setUint8(0, 'X'.charCodeAt(0)); // corrupt just the first magic byte
    expect(() => parseSplats(buffer)).toThrow(/magic/i);
  });
});
