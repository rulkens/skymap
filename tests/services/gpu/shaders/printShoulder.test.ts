/**
 * The antique print's highlight shoulder (`printShoulder` in lib/tonemap.wesl),
 * evaluated from the shader's own text. Under Reinhard (whitepoint 4, exposure 3)
 * the face-on Milky Way's bar sat past the curve's white, a near-round clipped
 * blob the stipple could not recover the bar's tilt and length from.
 */
import { describe, expect, it } from 'vitest';

import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';
import { reinhardExtended } from '../../../../src/services/gpu/passes/compositor';
import { REINHARD_WHITEPOINT } from '../../../../src/data/toneMapCurve';
import { ANTIQUE_PRINT_SHOULDER } from '../../../../src/data/rendering/antiqueLook';

function shoulderFromShader(): (x: number, knee: number, top: number) => number {
  const lib = readShaderSource('src/services/gpu/shaders/lib/tonemap.wesl');
  const body = /fn printShoulder\(x: f32, knee: f32, top: f32\) -> f32 \{([\s\S]*?)\n\}/.exec(
    lib,
  )?.[1];
  if (body === undefined) throw new Error('lib/tonemap.wesl lacks printShoulder');
  const fn = new Function(
    'pow',
    'max',
    'select',
    'x',
    'knee',
    'top',
    body.replace(/\blet\b/g, 'const'),
  );
  const select = (f: number, t: number, c: boolean) => (c ? t : f);
  return (x, knee, top) => fn(Math.pow, Math.max, select, x, knee, top);
}

describe('antique print highlight shoulder', () => {
  const shoulder = shoulderFromShader();
  const top = REINHARD_WHITEPOINT;
  const knee = ANTIQUE_PRINT_SHOULDER * top;
  const print = (x: number) => reinhardExtended(shoulder(x, knee, top), 1);

  it('leaves everything under the knee untouched', () => {
    for (const x of [0, 0.1, 0.5, 1, 2, knee]) expect(shoulder(x, knee, top)).toBeCloseTo(x, 6);
  });

  it('bends without a kink at the knee', () => {
    expect((shoulder(knee + 1e-3, knee, top) - knee) / 1e-3).toBeCloseTo(1, 2);
  });

  it("never reaches the curve's white, so a bar 2 to 10 times past it keeps a gradient", () => {
    expect(print(1000)).toBeLessThan(1);
    // Two 8-bit steps at least between a bar's flank and its peak.
    expect(print(10 * top) - print(2 * top)).toBeGreaterThan(2 / 255);
  });
});
