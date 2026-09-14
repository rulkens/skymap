/**
 * What the two offset fields have to get right: the offset they carry is the
 * reference-minus-primary difference actually measured nearby (not a rescaled
 * one), it reaches ground the primary never covered, the two classes stay out
 * of each other's average, and a class with no samples in reach borrows the
 * other rather than pulling the pixel to black.
 */

import { describe, expect, it } from 'vitest';

import { colourOffsetFields } from '../../../tools/textures/colourOffsetFields';

const SIDE = 64;
const SIGMA = 3;

type Rgb = readonly [number, number, number];

function plane(fill: (x: number, y: number) => number): Float32Array {
  const out = new Float32Array(SIDE * SIDE);
  for (let y = 0; y < SIDE; y++) {
    for (let x = 0; x < SIDE; x++) out[y * SIDE + x] = fill(x, y);
  }
  return out;
}

function rgbPlane(fill: (x: number, y: number) => Rgb): Float32Array {
  const out = new Float32Array(SIDE * SIDE * 3);
  for (let y = 0; y < SIDE; y++) {
    for (let x = 0; x < SIDE; x++) out.set(fill(x, y), (y * SIDE + x) * 3);
  }
  return out;
}

function sample(field: Float32Array, x: number, y: number): number[] {
  const i = (y * SIDE + x) * 3;
  return [field[i]!, field[i + 1]!, field[i + 2]!];
}

function expectRgbNear(actual: number[], expected: Rgb): void {
  for (let c = 0; c < 3; c++) expect(actual[c]!).toBeCloseTo(expected[c]!, 3);
}

describe('colourOffsetFields', () => {
  it('carries the measured difference and extends it past the covered patch', () => {
    const primary: Rgb = [10, 20, 30];
    const reference: Rgb = [60, 90, 130];
    const fields = colourOffsetFields({
      width: SIDE,
      height: SIDE,
      primary: rgbPlane(() => primary),
      reference: rgbPlane(() => reference),
      covered: plane((x, y) => (x >= 16 && x < 48 && y >= 16 && y < 48 ? 1 : 0)),
      landFraction: plane(() => 1),
      sigmaPx: SIGMA,
    });

    expectRgbNear(sample(fields.land, 32, 32), [50, 70, 100]);
    // Eight pixels outside the patch: the normalised convolution divides the
    // blurred difference by the blurred coverage, so the offset arrives at
    // full strength instead of fading toward zero with the sample weight.
    expectRgbNear(sample(fields.land, 8, 32), [50, 70, 100]);
  });

  it('keeps land and water offsets out of each other average', () => {
    // A shore down the middle with wildly different corrections either side:
    // one shared field would average them and get both halves wrong.
    const fields = colourOffsetFields({
      width: SIDE,
      height: SIDE,
      primary: rgbPlane(() => [10, 20, 30]),
      reference: rgbPlane((x) => (x < 32 ? [50, 20, 30] : [10, 20, 110])),
      covered: plane(() => 1),
      landFraction: plane((x) => (x < 32 ? 1 : 0)),
      sigmaPx: SIGMA,
    });

    expectRgbNear(sample(fields.land, 8, 32), [40, 0, 0]);
    expectRgbNear(sample(fields.water, 56, 32), [0, 0, 80]);
  });

  it('borrows the other class where its own has no samples in reach', () => {
    const fields = colourOffsetFields({
      width: SIDE,
      height: SIDE,
      primary: rgbPlane(() => [10, 20, 30]),
      reference: rgbPlane(() => [60, 90, 130]),
      covered: plane(() => 1),
      landFraction: plane(() => 1),
      sigmaPx: SIGMA,
    });

    // No water anywhere, so the water field can only fall back to land. Zero
    // here would drag every water pixel of a landlocked tile to the raw
    // primary colour while its land neighbours moved.
    expectRgbNear(sample(fields.water, 32, 32), [50, 70, 100]);
  });
});
