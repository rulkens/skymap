import { describe, it, expect } from 'vitest';
import {
  parseTranslationReport,
  parseRotationReport,
  parseCombinedReport,
} from '../../src/input/spaceMouseReport';

/**
 * Helper: build a DataView from a list of int16 little-endian values.
 *
 * Using `setInt16(..., true)` to write LE matches what the real device emits
 * on every desktop browser; the parser reads with the same endianness.
 */
function makeReport(int16s: number[]): DataView {
  const buf = new ArrayBuffer(int16s.length * 2);
  const dv = new DataView(buf);
  for (let i = 0; i < int16s.length; i++) {
    // noUncheckedIndexedAccess flags `int16s[i]` as `number | undefined`;
    // we know it's defined inside this loop, but the explicit `?? 0` keeps
    // tsc happy without a type assertion.
    dv.setInt16(i * 2, int16s[i] ?? 0, true);
  }
  return dv;
}

describe('parseTranslationReport', () => {
  it('decodes int16 LE at offsets 0/2/4 into tx/ty/tz', () => {
    // 175 / 350 = 0.5 — pick values that survive the divide cleanly so
    // floating-point fuzz doesn't muddy the assertion.
    const dv = makeReport([175, -175, 350]);
    const out = parseTranslationReport(dv);
    expect(out.tx).toBeCloseTo(0.5, 6);
    expect(out.ty).toBeCloseTo(-0.5, 6);
    expect(out.tz).toBeCloseTo(1, 6);
  });

  it('returns all zeros for an at-rest report', () => {
    const dv = makeReport([0, 0, 0]);
    const out = parseTranslationReport(dv);
    expect(out).toEqual({ tx: 0, ty: 0, tz: 0 });
  });

  it('clamps values above the 350 deflection cap to ±1', () => {
    // A misbehaving device could emit 32767; we should never let > 1 escape.
    const dv = makeReport([32767, -32768, 700]);
    const out = parseTranslationReport(dv);
    expect(out.tx).toBe(1);
    expect(out.ty).toBe(-1);
    expect(out.tz).toBe(1);
  });
});

describe('parseRotationReport', () => {
  it('decodes int16 LE into rx/ry/rz', () => {
    const dv = makeReport([350, 0, -350]);
    const out = parseRotationReport(dv);
    expect(out.rx).toBeCloseTo(1, 6);
    expect(out.ry).toBeCloseTo(0, 6);
    expect(out.rz).toBeCloseTo(-1, 6);
  });
});

describe('parseCombinedReport', () => {
  it('decodes all six axes from a 12-byte buffer', () => {
    // tx=1, ty=-1, tz=0.5, rx=-0.5, ry=0, rz=1
    const dv = makeReport([350, -350, 175, -175, 0, 350]);
    const out = parseCombinedReport(dv);
    expect(out.tx).toBeCloseTo(1, 6);
    expect(out.ty).toBeCloseTo(-1, 6);
    expect(out.tz).toBeCloseTo(0.5, 6);
    expect(out.rx).toBeCloseTo(-0.5, 6);
    expect(out.ry).toBeCloseTo(0, 6);
    expect(out.rz).toBeCloseTo(1, 6);
  });

  it('clamps every axis independently', () => {
    const dv = makeReport([1000, -1000, 1000, -1000, 1000, -1000]);
    const out = parseCombinedReport(dv);
    expect(out.tx).toBe(1);
    expect(out.ty).toBe(-1);
    expect(out.tz).toBe(1);
    expect(out.rx).toBe(-1);
    expect(out.ry).toBe(1);
    expect(out.rz).toBe(-1);
  });
});
