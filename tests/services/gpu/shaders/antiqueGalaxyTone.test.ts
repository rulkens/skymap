/**
 * A resolved galaxy's stipple tone, evaluated from the plate shader's own text
 * (`galaxyTone` in antiqueLook/fragment.wesl) through WGSL built-in shims. The
 * inputs are the print's luma as measured on the face-on Milky Way: the bar at
 * the print's white, an arm near 0.6, an inter-arm gap near 0.25, each over the
 * 1/16 band round it. A tone that saturated on the arms printed bar and arms alike.
 */
import { describe, expect, it } from 'vitest';

import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';

function weslF32(source: string, name: string): number {
  const m = new RegExp(`const\\s+${name}\\s*:\\s*f32\\s*=\\s*([0-9.e+-]+)\\s*;`).exec(source);
  if (!m) throw new Error(`no f32 const ${name}`);
  return Number(m[1]);
}

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
const SHIMS = {
  log: Math.log,
  max: Math.max,
  min: Math.min,
  pow: Math.pow,
  clamp,
  mix: (a: number, b: number, t: number) => a + (b - a) * t,
  smoothstep: (a: number, b: number, x: number) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  },
};

function galaxyToneFromShader(): (light: number, lowL: number, nucleus: number) => number {
  const plate = readShaderSource('src/services/gpu/shaders/antiqueLook/fragment.wesl');
  const body = /fn galaxyTone\(light: f32, lowL: f32, nucleus: f32\) -> f32 \{([\s\S]*?)\n\}/.exec(plate)?.[1];
  if (body === undefined) throw new Error('fragment.wesl lacks galaxyTone');
  const consts = Object.fromEntries(
    ['GALAXY_FLOOR', 'GALAXY_GAP', 'GALAXY_SB_POW', 'GALAXY_RELIEF_CAP', 'GALAXY_DISC_MAX'].map((name) => [name, weslF32(plate, name)]),
  );
  const scope = { ...SHIMS, ...consts };
  const fn = new Function(...Object.keys(scope), 'light', 'lowL', 'nucleus', body.replace(/\blet\b/g, 'const'));
  return (light, lowL, nucleus) => fn(...Object.values(scope), light, lowL, nucleus);
}

describe('antique galaxy stipple tone', () => {
  const tone = galaxyToneFromShader();
  const bar = tone(1.0, 0.8, 1.0);
  const arm = tone(0.6, 0.45, 0.6);
  const gap = tone(0.25, 0.45, 0.25);

  it('prints the bar near solid and clearly darker than an arm', () => {
    expect(bar).toBeGreaterThan(0.95);
    expect(bar - arm).toBeGreaterThan(0.15);
  });

  it('keeps an arm readable and its inter-arm gap near paper', () => {
    expect(arm).toBeGreaterThan(0.45);
    expect(gap).toBeLessThan(0.12);
  });

  it("keeps the bright inner disc a medium stipple under the bar's glare", () => {
    expect(tone(0.7, 0.9, 0.7)).toBeGreaterThan(0.4);
  });

  it('keeps a faint outer arm over its darker surroundings', () => {
    expect(tone(0.25, 0.15, 0.25)).toBeGreaterThan(0.25);
  });
});
