import { describe, expect, it } from 'vitest';

import { BODY_AMBIENT_LIGHT } from '../../../../../../src/data/bodies/bodyAmbientLight';
import { orenNayarMatchedShading } from '../../../../../../src/layers/body/surfaceTiles/format/utils/orenNayarMatchedShading';

describe('orenNayarMatchedShading', () => {
  it('lands the sub-solar diffuse on 1 - ambient at roughness 0.9', () => {
    const shading = orenNayarMatchedShading(0.9, 0.03);
    // Oren-Nayar A at sigma 0.9, by hand: 1 - 0.405 / 1.14.
    const orenNayarA = 0.644737;
    expect((shading.sunIrradiance * orenNayarA) / Math.PI).toBeCloseTo(1 - BODY_AMBIENT_LIGHT, 5);
    expect(shading.roughnessBase).toBe(0.9);
  });
});
