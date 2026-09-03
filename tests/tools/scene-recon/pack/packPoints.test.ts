/**
 * points.bin is the binary contract between the offline bake (packPoints,
 * Node) and the browser viewer (parsePoints) — these tests exercise both
 * ends together, decoding with a hand-written DataView so a stride or
 * field-order slip on either side shows up as a wrong value, not a pass.
 */
import { describe, it, expect } from 'vitest';
import { packPoints, type ScenePoint } from '../../../../tools/scene-recon/pack/packPoints';
import { parsePoints } from '../../../../tools/scene-workbench/src/scene/parsePoints';
import {
  POINTS_HEADER_BYTES,
  POINTS_RECORD_BYTES,
} from '../../../../tools/scene-recon/pack/pointCloudFormat';

const FIVE_POINTS: readonly ScenePoint[] = [
  { xM: 12.5, yM: -3.25, zM: 100.0, r: 10, g: 20, b: 30, classification: 2 },
  { xM: -450.75, yM: 8.0, zM: -1.5, r: 200, g: 5, b: 250, classification: 6 },
  { xM: 0.125, yM: 0.0, zM: 999.999, r: 1, g: 254, b: 128, classification: 0 },
  { xM: 3000.0, yM: -3000.0, zM: 0.5, r: 77, g: 88, b: 99, classification: 18 },
  { xM: -0.001, yM: 42.42, zM: -777.7, r: 255, g: 0, b: 17, classification: 255 },
];

describe('packPoints → parsePoints round-trips positions, colours and classification', () => {
  it('decodes every field of every record back to the packed input', () => {
    const buffer = packPoints(FIVE_POINTS).buffer as ArrayBuffer;

    const parsed = parsePoints(buffer);
    expect(parsed.pointCount).toBe(FIVE_POINTS.length);
    expect(parsed.records.buffer).toBe(buffer); // view, not a re-packed copy

    const dv = new DataView(
      parsed.records.buffer,
      parsed.records.byteOffset,
      parsed.records.byteLength,
    );
    FIVE_POINTS.forEach((point, i) => {
      const offset = i * POINTS_RECORD_BYTES;
      // float32 has ~7 significant digits; tolerance 2 keeps this a stride/
      // field-order check, not a precision assertion on the packed value.
      expect(dv.getFloat32(offset + 0, true)).toBeCloseTo(point.xM, 2);
      expect(dv.getFloat32(offset + 4, true)).toBeCloseTo(point.yM, 2);
      expect(dv.getFloat32(offset + 8, true)).toBeCloseTo(point.zM, 2);
      expect(dv.getUint8(offset + 12)).toBe(point.r);
      expect(dv.getUint8(offset + 13)).toBe(point.g);
      expect(dv.getUint8(offset + 14)).toBe(point.b);
      expect(dv.getUint8(offset + 15)).toBe(point.classification);
    });
  });
});

describe('parsePoints rejects a truncated buffer', () => {
  it('throws when the buffer is shorter than the header promises', () => {
    const full = packPoints(FIVE_POINTS).buffer as ArrayBuffer;
    // Header says 5 records; keep only the header + 2 records worth of bytes.
    const truncated = full.slice(0, POINTS_HEADER_BYTES + 2 * POINTS_RECORD_BYTES);
    expect(() => parsePoints(truncated)).toThrow(/pointCount|length/i);

    // Shorter than the 16-byte header itself — the pointCount field can't
    // even be read, so this must fail before that check runs.
    expect(() => parsePoints(new ArrayBuffer(8))).toThrow();
  });
});

describe('parsePoints rejects a wrong magic', () => {
  it('throws when the magic bytes do not match PTS3', () => {
    const buffer = packPoints(FIVE_POINTS).buffer as ArrayBuffer;
    const dv = new DataView(buffer);
    dv.setUint8(0, 'X'.charCodeAt(0)); // corrupt just the first magic byte
    expect(() => parsePoints(buffer)).toThrow(/magic/i);
  });
});
