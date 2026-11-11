import { describe, expect, it } from 'vitest';

import { BODY_AMBIENT_LIGHT } from '../../../../../../src/data/bodies/bodyAmbientLight';
import { orenNayarMatchedShading } from '../../../../../../src/layers/body/surfaceTiles/format/utils/orenNayarMatchedShading';

describe('orenNayarMatchedShading', () => {
  it.each([0.5, 0.9])('lands the sub-solar diffuse on 1 - ambient at roughness %f', (roughness) => {
    const shading = orenNayarMatchedShading(roughness, 0.03);
    const sigma2 = roughness ** 2;
    const orenNayarA = 1 - (0.5 * sigma2) / (sigma2 + 0.33);
    expect((shading.sunIrradiance * orenNayarA) / Math.PI).toBeCloseTo(1 - BODY_AMBIENT_LIGHT, 12);
    expect(shading.roughnessBase).toBe(roughness);
  });
});
