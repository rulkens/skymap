/**
 * DustField — the value-noise-driven density/opacity/size modulator every
 * dust builder samples per candidate particle. Ported from
 * galaxy-model.js:507-520.
 *
 * `createDustField`'s construction is draw-free: the value-noise sampler it
 * wraps (`makeValueNoise`) is a pure function of its seed, unlike the
 * mutable `rand`/`randNormal` streams on `GalaxyBuildContext`. That's what
 * lets the dust pass build one lazily right at its own `dustAmount > 0 &&
 * category !== 'elliptical'` gate without perturbing draw order for callers
 * that skip the gate entirely (an elliptical galaxy never builds a
 * `DustField` at all).
 *
 * `dustMod` itself is NOT pure: it draws exactly one `rand()` value per call
 * (the accept/reject roll for `keep`), so — like `GalaxyBuildContext`'s own
 * streams — call order against it is part of the ported contract.
 */

export type DustField = {
  /** Draws exactly one `rand()` per call. */
  readonly dustMod: (
    x: number,
    y: number,
    z: number,
  ) => { readonly keep: boolean; readonly op: number; readonly sz: number };
  /** exp(−r / (diskScaleLen · 1.5)) — inner-concentrated. */
  readonly radialFalloff: (r: number) => number;
};
