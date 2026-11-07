/**
 * A star's glyph class from its catalogue entry, evaluated from the shaders' own
 * text: `apparentMagnitude` (antiqueLook/printPoint.wesl) and the glyph rank
 * (antiqueLook/glyphs.wesl) run here in JS through a few WGSL built-in shims, so
 * a slipped log base, distance unit or ladder direction fails on named stars.
 */
import { describe, expect, it } from 'vitest';

import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';

const DIR = 'src/services/gpu/shaders';
const PC_TO_MPC = 1e-6;

function weslF32(source: string, name: string): number {
  const m = new RegExp(`const\\s+${name}\\s*:\\s*f32\\s*=\\s*([0-9.e+-]+)\\s*;`).exec(source);
  if (!m) throw new Error(`no f32 const ${name}`);
  return Number(m[1]);
}

/** WGSL `round` is round-half-to-even; `i32` truncates. */
const SHIMS = {
  max: Math.max,
  log2: Math.log2,
  clamp: (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi),
  round: (x: number) => (Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : Math.round(x)),
  i32: Math.trunc,
};

function apparentMagnitudeFromShader(): (absMag: number, d2Mpc2: number) => number {
  const printPoint = readShaderSource(`${DIR}/antiqueLook/printPoint.wesl`);
  const photometry = readShaderSource(`${DIR}/lib/starPhotometry.wesl`);
  const body = /fn apparentMagnitude\(absMag: f32, d2Mpc2: f32\) -> f32 \{([\s\S]*?)\n\}/.exec(
    printPoint,
  )?.[1];
  if (body === undefined) throw new Error('printPoint.wesl lacks apparentMagnitude');
  const consts = {
    D_REF_MPC: weslF32(photometry, 'D_REF_MPC'),
    MIN_D2_MPC2: weslF32(photometry, 'MIN_D2_MPC2'),
    LOG10_2: weslF32(printPoint, 'LOG10_2'),
  };
  const scope = { ...SHIMS, ...consts };
  const fn = new Function(...Object.keys(scope), 'absMag', 'd2Mpc2', body.replace(/\blet\b/g, 'const'));
  return (absMag, d2Mpc2) => fn(...Object.values(scope), absMag, d2Mpc2);
}

function glyphClassFromShader(): (mag: number) => number {
  const glyphs = readShaderSource(`${DIR}/antiqueLook/glyphs.wesl`);
  const rank = /let rank = (.*);/.exec(glyphs)?.[1];
  if (rank === undefined) throw new Error('glyphs.wesl lacks its rank line');
  const fn = new Function(...Object.keys(SHIMS), 's', `return ${rank};`);
  return (mag) => fn(...Object.values(SHIMS), { z: mag });
}

describe('antique star class from the catalogue', () => {
  const apparent = apparentMagnitudeFromShader();
  const glyphClass = glyphClassFromShader();
  const classOf = (absMag: number, distancePc: number) =>
    glyphClass(apparent(absMag, (distancePc * PC_TO_MPC) ** 2));

  it('reads the absolute magnitude at 10 pc', () => {
    expect(apparent(1.0, (10 * PC_TO_MPC) ** 2)).toBeCloseTo(1.0, 5);
    expect(apparent(1.0, (100 * PC_TO_MPC) ** 2)).toBeCloseTo(6.0, 5);
  });

  it('puts the named stars on the seven-step ladder by their apparent magnitude', () => {
    expect(classOf(1.42, 2.64)).toBe(6); // Sirius, m −1.46
    expect(classOf(-2.77, 42.8)).toBe(5); // Achernar, m 0.46
    expect(classOf(1.72, 7.7)).toBe(4); // Fomalhaut, m 1.16
    expect(classOf(-3.64, 132.6)).toBe(3); // Polaris, m 1.98
    expect(classOf(-1.1, 37.7)).toBe(3); // Dubhe, m 1.79
    expect(classOf(-0.2, 25.3)).toBe(3); // Alioth, m 1.77
  });

  it('gives the faintest naked-eye stars the smallest glyph', () => {
    expect(glyphClass(4.9)).toBe(0);
    expect(glyphClass(5.7)).toBe(0);
    expect(glyphClass(4.4)).toBe(1);
  });
});
