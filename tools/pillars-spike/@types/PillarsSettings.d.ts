/**
 * Every live-tunable knob of the pillars spike, UI → engine. One flat bag
 * (rather than per-subsystem slices) because the spike's whole purpose is
 * cross-cutting look iteration; structure would just add hops.
 *
 * Volumetric terms (consumed by nebula.wesl via SceneUniforms):
 *   densityMul     dust optical-depth multiplier
 *   emissionMul    ionization-front emission strength
 *   scatterMul     starlight in-scatter strength
 *   ambientMul     sky/ambient fill strength
 *   starBrightness billboard star intensity multiplier
 *   phaseG         Henyey-Greenstein forward anisotropy [0, ~0.85]
 *
 * Display terms (consumed by composite.wesl):
 *   exposure, bloom, saturation, vignette, tonemap (0 ACES, 1 Reinhard,
 *   2 Reinhard-extended, 3 Uncharted 2, 4 linear)
 *
 * renderScale — HDR target resolution as a fraction of the canvas
 * (0.5 / 0.75 / 1.0): the primary performance lever, since raymarch cost
 * scales with shaded pixels.
 */
export type PillarsSettings = {
  densityMul: number;
  emissionMul: number;
  scatterMul: number;
  ambientMul: number;
  starBrightness: number;
  phaseG: number;
  exposure: number;
  bloom: number;
  saturation: number;
  vignette: number;
  tonemap: number;
  renderScale: number;
};
