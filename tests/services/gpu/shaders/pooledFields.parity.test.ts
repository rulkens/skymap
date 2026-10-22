/**
 * Parity guard: `points/pooledFields.wesl` derives on the GPU what `derivePointRecord`
 * bakes on the CPU for the flat interleave, so two implementations must agree. No harness
 * here executes WGSL, so the test runs the shader's own source: its scalar subset (consts,
 * lets, selects, math builtins) maps one-to-one onto JS, evaluated in f64, which the f32
 * GPU matches to well inside the tolerances below.
 */
import { describe, expect, it } from 'vitest';

import { derivePointRecord } from '../../../../src/utils/galaxy/derivePointRecord';
import { bandMagOfBakedAbsMag } from '../../../../src/utils/galaxy/bandMagOfBakedAbsMag';
import { GALAXY_COLUMN_SCHEMA } from '../../../../src/data/octree/galaxyOctreeFamily';
import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';
import type { ColumnId } from '../../../../src/@types/octree/ColumnId';
import type { GalaxyPointDerived } from '../../../../src/@types/engine/GalaxyPointDerived';

type Fn = (...args: (number | boolean)[]) => number | number[];

/** The file's functions as JS: only the constructs `pooledFields.wesl` uses are mapped. */
function wgslFunctions(path: string): Record<string, Fn> {
  const src = readShaderSource(path).replace(/\/\/.*$/gm, '');
  const names = [...src.matchAll(/fn (\w+)\(/g)].map((m) => m[1]!);
  const js = src
    .replace(/const (\w+): \w+ =/g, 'const $1 =')
    .replace(
      /fn (\w+)\(([^)]*)\)\s*->\s*[\w<>]+\s*\{/g,
      (_, name: string, args: string) => `function ${name}(${args.replace(/:\s*[\w<>]+/g, '')}) {`,
    )
    .replace(/vec2<f32>\(/g, 'vec2(');
  const prelude = `const { log2, pow, cos, sin } = Math;
    const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
    const select = (f, t, c) => (c ? t : f);
    const vec2 = (a, b) => [a, b];`;
  return new Function(`${prelude}\n${js}\nreturn { ${names.join(', ')} };`)() as Record<string, Fn>;
}

const wgsl = wgslFunctions('src/services/gpu/shaders/galaxyCatalog/points/pooledFields.wesl');
const q = (id: ColumnId) => GALAXY_COLUMN_SCHEMA.find((c) => c.id === id)!;
const wire = (id: ColumnId, code: number) => Math.fround(q(id).q0 + code * q(id).q1);
const STATS = { magOffset: 0.73, medianAbsMag: -20.4 };
const CODES = [0, 1, 64, 127, 128, 200, 254, 255];
// 0 is a record at the observer (the band magnitude is NaN there); the rest span GLADE's depth.
const DISTANCES_MPC = [0, 1e-3, 0.8, 21.3, 700, 12000];

function cpu(absMag: number, d: number, pa: number, logSize: number, sizeFallback: boolean) {
  const out: GalaxyPointDerived = {
    magnitude: 0,
    axisRatio: 0,
    paCos: 0,
    paSin: 0,
    radiusMpc: 0,
    absMag: 0,
    sbAmp: 0,
  };
  // A direction off every axis, so no component carries the distance alone.
  const [x, y, z] = [0.48, -0.6, 0.64].map((c) => c * d) as [number, number, number];
  derivePointRecord(
    {
      x,
      y,
      z,
      magnitude: bandMagOfBakedAbsMag(absMag, Math.hypot(x, y, z), STATS.magOffset),
      axisRatio: 0.5,
      positionAngleDeg: pa,
      diameterKpc: 10 ** logSize,
      orientationIsFallback: false,
      diameterIsFallback: sizeFallback,
    },
    STATS,
    out,
  );
  return out;
}

describe('pooledFields.wesl ↔ derivePointRecord', () => {
  it.each(CODES)('absMag code %i: magnitude, absMag and sbAmp agree at every distance', (c) => {
    const absMag = wire('absMag', c);
    for (const logCode of CODES) {
      const logSize = wire('logSize', logCode);
      const diameterKpc = 10 ** logSize;
      for (const d of DISTANCES_MPC) {
        const want = cpu(absMag, d, 0, logSize, false);
        expect(wgsl.pooledMagnitude!(absMag, d)).toBeCloseTo(want.magnitude, 4);
        // The CPU path's absMag at a record off the observer is the wire value the GPU reads.
        if (d > 0) expect(want.absMag).toBeCloseTo(absMag, 4);
        // At the observer the CPU's NaN band magnitude falls back to 1; no record sits there.
        if (d === 0) continue;
        const sb = wgsl.pooledSbAmp!(absMag - STATS.magOffset, STATS.medianAbsMag, diameterKpc);
        expect(sb as number).toBeCloseTo(want.sbAmp, 6 - Math.max(0, Math.log10(want.sbAmp)));
      }
    }
  });

  it.each(CODES)('pa code %i: the rotation agrees', (c) => {
    const pa = wire('pa', c);
    const want = cpu(-20, 50, pa, 1, false);
    const [cos, sin] = wgsl.pooledPaCosSin!(pa) as number[];
    expect(cos).toBeCloseTo(want.paCos, 6);
    expect(sin).toBeCloseTo(want.paSin, 6);
  });

  it.each(CODES)('logSize code %i: the padded radius and its fallback sign agree', (c) => {
    const logSize = wire('logSize', c);
    for (const fallback of [false, true]) {
      const want = cpu(-20, 50, 0, logSize, fallback);
      const got = wgsl.pooledRadiusMpc!(10 ** logSize, fallback) as number;
      expect(Math.sign(got)).toBe(Math.sign(want.radiusMpc));
      expect(got / want.radiusMpc).toBeCloseTo(1, 6);
    }
  });
});
