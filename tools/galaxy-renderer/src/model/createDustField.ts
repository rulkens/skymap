/**
 * createDustField — builds the `DustField` (see its docblock for why
 * construction is draw-free): seeds a value-noise sampler, derives its two
 * octave frequencies from `outerRadius`/`dustNoiseScale`, and closes over
 * both into `dustMod`/`radialFalloff`. Ported from galaxy-model.js:505-520.
 *
 * The seed XORs `params.seed` against a fixed Weyl constant (`0x9e3779b9`,
 * the golden-ratio hash multiplier) so the dust-noise field is decorrelated
 * from the position noise the same seed drives elsewhere — two different
 * looking fields from one user-facing "seed" knob, not one field reused.
 */
import { makeValueNoise } from '../../../../src/utils/random/makeValueNoise';
import type { DustField } from '../../@types/model/DustField';
import type { GalaxyBuildContext } from '../../@types/model/GalaxyBuildContext';

export function createDustField(ctx: GalaxyBuildContext): DustField {
  const { params, rand, outerRadius, diskScaleLen } = ctx;
  const dustNoiseAmt = params.dustNoise ?? 0.6;
  const dustNoiseScale = params.dustNoiseScale ?? 1;

  const noise = makeValueNoise((((params.seed ?? 0) | 0) ^ 0x9e3779b9) >>> 0);
  const nfreq = (2.4 * dustNoiseScale) / outerRadius;

  // Two-octave sample: a base frequency plus a half-weighted 2.3x-frequency
  // detail layer, normalised by their combined weight (1 + 0.5 = 1.5) so the
  // result stays roughly in [0, 1) like a single octave would.
  const noiseAt = (x: number, y: number, z: number): number =>
    (noise(x * nfreq, y * nfreq * 0.5, z * nfreq) +
      0.5 * noise(x * nfreq * 2.3, y * nfreq, z * nfreq * 2.3)) /
    1.5;

  const dustMod = (
    x: number,
    y: number,
    z: number,
  ): { readonly keep: boolean; readonly op: number; readonly sz: number } => {
    const f = noiseAt(x, y, z);
    return {
      keep: rand() < 1 - dustNoiseAmt + dustNoiseAmt * (0.15 + 1.5 * f * f),
      op: 1 - dustNoiseAmt + dustNoiseAmt * (0.25 + 1.9 * f),
      sz: 1 - dustNoiseAmt + dustNoiseAmt * (0.5 + 1.3 * f),
    };
  };

  const radialFalloff = (r: number): number => Math.exp(-r / (diskScaleLen * 1.5));

  return { dustMod, radialFalloff };
}
