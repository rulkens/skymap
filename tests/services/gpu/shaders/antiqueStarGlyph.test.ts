/**
 * `starGlyph` (antiqueLook/glyphs/fragment.wesl) evaluated from the shader's own text through
 * a few WGSL built-in shims: a ray's ink must stop at its tip, not run on as a
 * half-ink hairline to the quad's edge.
 */
import { describe, expect, it } from 'vitest';

import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';

type V2 = { x: number; y: number };

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
const SHIMS = {
  length: (q: V2) => Math.hypot(q.x, q.y),
  atan2: Math.atan2,
  round: (x: number) => (Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : Math.round(x)),
  abs: Math.abs,
  cos: Math.cos,
  sin: Math.sin,
  max: Math.max,
  min: Math.min,
  clamp: (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi),
  select: <T>(f: T, t: T, c: boolean) => (c ? t : f),
  i32: Math.trunc,
  smoothstep,
  step: (edge: number, x: number) => (x >= edge ? 1 : 0),
};

const SOURCE = readShaderSource('src/services/gpu/shaders/antiqueLook/glyphs/fragment.wesl');
const RAY_REACH = Number(
  /const RAY_REACH: f32 = ([0-9.]+);/.exec(
    readShaderSource('src/services/gpu/shaders/antiqueLook/glyphs/io.wesl'),
  )?.[1],
);

function starGlyphFromShader(): (q: V2, r: number, rays: number) => number {
  const body = /fn starGlyph\(q: vec2<f32>, r: f32, rays: f32\) -> f32 \{([\s\S]*?)\n\}/.exec(
    SOURCE,
  )?.[1];
  if (body === undefined) throw new Error('glyphs.wesl lacks starGlyph');
  const scope = { ...SHIMS, RAY_REACH };
  const fn = new Function(
    ...Object.keys(scope),
    'q',
    'r',
    'rays',
    body.replace(/\blet\b/g, 'const'),
  );
  return (q, r, rays) => fn(...Object.values(scope), q, r, rays);
}

describe('antique star glyph', () => {
  const glyph = starGlyphFromShader();
  // Ray k = 0 points along −y (the shader's sectors start a quarter turn round).
  const onRay = (along: number, r: number, rays: number) => glyph({ x: 0, y: -along }, r, rays);

  it.each([4, 8])('inks a %i-ray glyph from core to tip, and nothing past the tip', (rays) => {
    const r = 12;
    const tip = RAY_REACH * r;
    expect(RAY_REACH).toBeGreaterThanOrEqual(1.5);
    expect(onRay(0.3 * r, r, rays)).toBeCloseTo(1);
    expect(onRay(0.75 * tip, r, rays)).toBeGreaterThan(0.5);
    for (const past of [1, 3, 10]) expect(onRay(tip + past, r, rays)).toBe(0);
  });

  it("cuts a Bode short ray at its own tip, short of a long ray's", () => {
    const r = 12;
    const shortTip = 0.5 * r + 0.55 * (RAY_REACH * r - 0.5 * r);
    const shortRay = (along: number) =>
      glyph(
        { x: along * Math.sin((2 * Math.PI) / 8), y: -along * Math.cos((2 * Math.PI) / 8) },
        r,
        8,
      );
    expect(shortRay(0.7 * shortTip)).toBeGreaterThan(0.5);
    expect(shortRay(shortTip + 1)).toBe(0);
  });
});
