/**
 * Hand-computed spec for the Sobel-gradient normal-map bake.
 *
 * `bakeNormalMap` is the build pipeline's FIRST derived output — every other
 * texture is a resize of fetched pixels, this one COMPUTES new pixels from a
 * heightfield. Its correctness is therefore not "did sharp preserve bytes" but
 * "is the gradient math right", so these expectations are derived by hand from
 * the Sobel kernel and the RG-encoding contract, independent of the
 * implementation (not a mirror of the code).
 *
 * Kernel + encoding recap (see the module header for the full derivation):
 *
 *  - height normalized to [0,1] (byte / 255);
 *  - Sobel-X sum `sx = (tr+2mr+br) - (tl+2ml+bl)`, Sobel-Y-over-rows
 *    `syRow = (bl+2bc+br) - (tl+2tc+tr)`; per-texel gradient = sum / 8;
 *  - `gx = sx/8` is dh/du (+u = east = +column);
 *  - `gv = -(syRow/8)` is dh/dv (+v = north = bitangent = DECREASING row,
 *    because equirect rows run north→south as the row index increases);
 *  - `normal = normalize(vec3(-gx*E, -gv*E, 1))`;
 *  - `R = round((nx*0.5+0.5)*255)`, `G = round((ny*0.5+0.5)*255)`, B = A = 255.
 */

import { expect, it } from 'vitest';

import { bakeNormalMap, DEFAULT_EXAGGERATION } from '../../../tools/textures/bakeNormalMap';

type Rgba = { r: number; g: number; b: number; a: number };

/** A single output pixel, RGBA, at (x, y). */
function px(
  out: { data: Buffer; info: { width: number; height: number } },
  x: number,
  y: number,
): Rgba {
  const i = (y * out.info.width + x) * 4;
  return { r: out.data[i]!, g: out.data[i + 1]!, b: out.data[i + 2]!, a: out.data[i + 3]! };
}

/** Build a single-channel heightfield from a `(x, y) => byte` generator. */
function field(width: number, height: number, gen: (x: number, y: number) => number) {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = gen(x, y);
  }
  return { data, width, height };
}

it('bakes a flat heightfield to the neutral normal', () => {
  // Every texel equal ⇒ every Sobel sum is 0 ⇒ normal = (0,0,1) ⇒
  // R = round((0*0.5+0.5)*255) = round(127.5) = 128, likewise G; B = A = 255.
  // The commonest kernel bug (a stray offset making the flat gradient nonzero)
  // flips this red.
  const out = bakeNormalMap(
    field(4, 3, () => 100),
    DEFAULT_EXAGGERATION,
  );
  expect(out.info.channels).toBe(4);
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 4; x++) {
      expect(px(out, x, y)).toEqual({ r: 128, g: 128, b: 255, a: 255 });
    }
  }
});

it('tilts R (not G) toward the downhill side for a +x ramp', () => {
  // height = 10*x per column (0,10,20,30,40 across width 5), constant down rows.
  //   sx  = (10(x+1) - 10(x-1)) * (1+2+1) / 255 = 80/255  at every interior column
  //   gx  = (80/255)/8 = +0.03922  (dh/du > 0: terrain rises to the east)
  //   syRow = 0  (no variation down rows, even at the clamped poles) ⇒ gv = 0
  //   nx  = -gx*E < 0  ⇒  R = round((nx*0.5+0.5)*255) < 128
  //   ny  = 0          ⇒  G = 128
  // Interior columns (x∈1..3) never touch the x-seam, so all share ONE RG.
  const out = bakeNormalMap(
    field(5, 3, (x) => 10 * x),
    1,
  );
  const ref = px(out, 2, 1);
  expect(ref.g).toBe(128);
  expect(ref.r).toBeLessThan(128); // downhill sign: rising-east ⇒ R below neutral
  expect(ref.b).toBe(255);
  // Every interior pixel (columns 1..3, all rows) shares that one RG.
  for (let y = 0; y < 3; y++) {
    for (let x = 1; x <= 3; x++) {
      expect(px(out, x, y).r).toBe(ref.r);
      expect(px(out, x, y).g).toBe(128);
    }
  }
});

it('tilts G (not R) for a +y ramp', () => {
  // height = 10*y per row (rises toward the south, since row 0 = north).
  //   sx    = 0  (each row constant across columns; the x-seam wraps to equal
  //              values too) ⇒ gx = 0 ⇒ R = 128 everywhere.
  //   syRow = (10(y+1) - 10(y-1)) * 4 / 255 = 80/255 > 0
  //   gv    = -(80/255)/8 < 0  ⇒  ny = -gv*E > 0  ⇒  G > 128.
  // Catches an x/y axis swap the +x test alone cannot.
  const out = bakeNormalMap(
    field(3, 5, (_x, y) => 10 * y),
    1,
  );
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) expect(px(out, x, y).r).toBe(128);
  }
  const interior = px(out, 1, 2);
  expect(interior.g).toBeGreaterThan(128); // rising-south ⇒ G above neutral
});

it('scales the tilt monotonically with exaggeration', () => {
  // The same +x ramp at E=2 tilts nx twice as steep as at E=1, so |R-128| is
  // strictly larger. An independent monotonicity property — fails if the
  // exaggeration argument is ignored or misapplied. (Gradients here are tiny,
  // ~0.04, nowhere near byte saturation, so the inequality is strict.)
  const ramp = field(5, 3, (x) => 10 * x);
  const at1 = px(bakeNormalMap(ramp, 1), 2, 1);
  const at2 = px(bakeNormalMap(ramp, 2), 2, 1);
  expect(Math.abs(at2.r - 128)).toBeGreaterThan(Math.abs(at1.r - 128));
});

it('does not fabricate a gradient across the longitude seam', () => {
  // A field that varies only in y (constant across each row ⇒ column 0 equals
  // column width-1). With the longitude wrap, the seam column's horizontal
  // neighbours (the far column and column 1) are in the SAME row as itself, so
  // sx = 0 and R = 128. A naive linear-index Sobel that reads `idx-1` at column
  // 0 would pull from the PREVIOUS row (a different height) and fabricate an
  // x-gradient there — this pins the seam columns to neutral R.
  const out = bakeNormalMap(
    field(4, 4, (_x, y) => 10 * y),
    DEFAULT_EXAGGERATION,
  );
  for (let y = 0; y < 4; y++) {
    expect(px(out, 0, y).r).toBe(128); // west seam column
    expect(px(out, 3, y).r).toBe(128); // east seam column
  }
});
