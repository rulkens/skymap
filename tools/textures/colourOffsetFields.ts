/**
 * colourOffsetFields — the maths behind `colourMatchedImagerySource`: two
 * low-frequency RGB offset fields, one per land/water class, over a canvas
 * both imagery sources have been resampled onto.
 *
 * Per class and channel, a normalised Gaussian convolution of the measured
 * difference: `D = G(W * (reference - primary)) / G(W)`, `W` being the class's
 * own sample weight. Dividing by the blurred weight keeps the offset at full
 * strength off the edge of coverage and inside the other class's ground.
 */

import { gaussianBlurFloat32 } from '../utils/image/gaussianBlurFloat32';

/** Below this blurred sample weight the ratio is numerically meaningless —
 *  one part in a thousand of a unit-weight pixel, ~3.5 sigma from any sample. */
const MIN_WEIGHT = 1e-3;

export function colourOffsetFields(input: {
  readonly width: number;
  readonly height: number;
  /** Interleaved RGB, one triple per canvas pixel; the imagery being corrected. */
  readonly primary: Float32Array;
  /** Interleaved RGB, the coarser band whose colour is being matched. */
  readonly reference: Float32Array;
  /** 0..1 — how much usable sample this canvas pixel holds from both sources. */
  readonly covered: Float32Array;
  /** 0..1 — 1 is wholly land, 0 wholly water. */
  readonly landFraction: Float32Array;
  readonly sigmaPx: number;
}): { land: Float32Array; water: Float32Array } {
  const { width, height, primary, reference, covered, landFraction, sigmaPx } = input;
  const pixels = width * height;

  const landWeight = new Float32Array(pixels);
  const waterWeight = new Float32Array(pixels);
  for (let i = 0; i < pixels; i++) {
    landWeight[i] = covered[i]! * landFraction[i]!;
    waterWeight[i] = covered[i]! * (1 - landFraction[i]!);
  }
  const landDenominator = gaussianBlurFloat32(landWeight, width, height, sigmaPx);
  const waterDenominator = gaussianBlurFloat32(waterWeight, width, height, sigmaPx);

  const land = new Float32Array(pixels * 3);
  const water = new Float32Array(pixels * 3);
  const landDifference = new Float32Array(pixels);
  const waterDifference = new Float32Array(pixels);
  for (let channel = 0; channel < 3; channel++) {
    for (let i = 0; i < pixels; i++) {
      const difference = reference[i * 3 + channel]! - primary[i * 3 + channel]!;
      landDifference[i] = landWeight[i]! * difference;
      waterDifference[i] = waterWeight[i]! * difference;
    }
    const landNumerator = gaussianBlurFloat32(landDifference, width, height, sigmaPx);
    const waterNumerator = gaussianBlurFloat32(waterDifference, width, height, sigmaPx);

    for (let i = 0; i < pixels; i++) {
      const hasLand = landDenominator[i]! > MIN_WEIGHT;
      const hasWater = waterDenominator[i]! > MIN_WEIGHT;
      const landOffset = hasLand ? landNumerator[i]! / landDenominator[i]! : 0;
      const waterOffset = hasWater ? waterNumerator[i]! / waterDenominator[i]! : 0;
      // A class with no samples in reach borrows the other's offset: zero
      // would leave a landlocked tile's water (or an inland sea's shore) at
      // the raw primary colour while everything around it moved.
      land[i * 3 + channel] = hasLand ? landOffset : waterOffset;
      water[i * 3 + channel] = hasWater ? waterOffset : landOffset;
    }
  }
  return { land, water };
}
