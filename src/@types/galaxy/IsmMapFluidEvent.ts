/**
 * SfMapFluidEvent — one impulse the fluid SF-map generator's CPU event list
 * feeds into `sfMapFluidStep.wesl`'s velocity field (`GalaxySfMapFluidParams`'s
 * header). Generated once per rebuild by `buildGalaxySfMapFluidEvents`
 * (deterministic per seed), then packed by `packSfMapFluidEvents` into the
 * flat storage buffer the shader reads — this type is the PRE-pack, testable
 * shape; the packer owns the GPU layout.
 */
export type SfMapFluidEvent = {
  /** Texel position on the SF_MAP_AZ x SF_MAP_RINGS grid — same units `sfMapFluidStep.wesl` advects in. */
  readonly az: number;
  readonly ring: number;
  /** Generation step this event ignites at; inactive before it and past `impulseDuration` steps after. */
  readonly birthStep: number;
  /** Outward kernel-velocity amplitude at age 0, in texels/step (`GalaxySfMapFluidParams.impulseStrength`, per-event jittered). */
  readonly strength: number;
  /** Base kernel radius in ring-texel-equivalent units (`GalaxySfMapFluidParams.radiusScale`, per-event jittered) — grows with age^0.6, see the shader. */
  readonly radiusScale: number;
};
