/**
 * envBrdfLut — Karis 2013 split-sum second term: the (scale, bias) pair a
 * shader turns back into the GGX specular integral as `F0 * scale + bias`.
 *
 * Texel (x, y) is (NoV, perceptual roughness) at texel centres in (0, 1) —
 * the coordinates a clamp-to-edge linear sampler reads back unchanged.
 * Hammersley replaces the usual RNG because the baked LUT is committed: a
 * rebuild has to reproduce it byte for byte.
 */
import { radicalInverseVdC } from '../utils/math/radicalInverseVdC';

/**
 * Smith G with the IBL remap k = alpha / 2. The analytic-light remap
 * (roughness + 1)² / 8 is the wrong one for this integral and visibly
 * darkens rough grazing reflections.
 */
function smithGeometryIbl(noV: number, noL: number, alpha: number): number {
  const k = alpha / 2;
  return (noV / (noV * (1 - k) + k)) * (noL / (noL * (1 - k) + k));
}

export function envBrdfLut(size: number, sampleCount: number): Float32Array {
  const out = new Float32Array(size * size * 2);
  for (let y = 0; y < size; y += 1) {
    const roughness = (y + 0.5) / size;
    const alpha = roughness * roughness;
    const alpha2 = alpha * alpha;
    for (let x = 0; x < size; x += 1) {
      const noV = (x + 0.5) / size;
      // The view sits in the x-z plane against the normal (0, 0, 1). That is
      // what lets the halfway vector's y component go uncomputed below: VoH,
      // NoH and NoL are all independent of it.
      const viewX = Math.sqrt(Math.max(0, 1 - noV * noV));
      let scale = 0;
      let bias = 0;
      for (let i = 0; i < sampleCount; i += 1) {
        const phi = 2 * Math.PI * (i / sampleCount);
        const u = radicalInverseVdC(i);
        const cosTheta = Math.sqrt((1 - u) / (1 + (alpha2 - 1) * u));
        const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
        const halfX = sinTheta * Math.cos(phi);
        const noH = cosTheta;
        const voH = viewX * halfX + noV * noH;
        const noL = 2 * voH * noH - noV;
        if (noL <= 0) continue;
        const visibility = (smithGeometryIbl(noV, noL, alpha) * voH) / (noH * noV);
        const fresnel = (1 - voH) ** 5;
        scale += (1 - fresnel) * visibility;
        bias += fresnel * visibility;
      }
      const texel = (y * size + x) * 2;
      out[texel] = scale / sampleCount;
      out[texel + 1] = bias / sampleCount;
    }
  }
  return out;
}
