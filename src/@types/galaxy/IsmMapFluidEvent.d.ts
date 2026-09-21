/**
 * IsmMapFluidEvent — one impulse the fluid ISM-map generator's CPU event list
 * feeds into `ismMapFluidStep.wesl`'s velocity field (`GalaxyIsmMapFluidParams`'s
 * header). Generated once per rebuild by `buildGalaxyIsmMapFluidEvents`
 * (deterministic per seed), then packed by `packIsmMapFluidEvents` into the
 * flat storage buffer the shader reads — this type is the PRE-pack, testable
 * shape; the packer owns the GPU layout.
 */
export type IsmMapFluidEvent = {
  /** Texel position on the ISM_MAP_AZ x ISM_MAP_RINGS grid — same units `ismMapFluidStep.wesl` advects in. */
  readonly az: number;
  readonly ring: number;
  /** Generation step this event ignites at; inactive before it and past `impulseDuration` steps after. */
  readonly birthStep: number;
  /** Outward kernel-velocity amplitude at age 0, in texels/step (`GalaxyIsmMapFluidParams.impulseStrength`, per-event jittered). */
  readonly strength: number;
  /** Base kernel radius in ring-texel-equivalent units (`GalaxyIsmMapFluidParams.radiusScale`, per-event jittered) — grows with age^0.6, see the shader. */
  readonly radiusScale: number;
};
