/**
 * GalaxyFieldTuning — live-tunable knobs for the analytic field's warped
 * outer disc rings (`pushDiscRings`) and spiral-arm ridge blobs
 * (`pushArmRidges`), both in `galaxyFieldMixture.ts`. Optional on
 * `buildGalaxyFieldMixture`; omitted, the mixture reproduces today's fixed
 * constants exactly (see `DEFAULT_GALAXY_FIELD_TUNING`).
 */
export type GalaxyFieldTuning = {
  /** Number of rings, evenly spaced between the inner and outer radius fractions. */
  readonly ringCount: number;
  /** Innermost ring's radius, a fraction of the disc's outerRadius. */
  readonly ringInnerRadiusFrac: number;
  /** Outermost ring's radius, a fraction of the disc's outerRadius. */
  readonly ringOuterRadiusFrac: number;
  /** Blobs per ring — the knob for spike suppression (see `pushDiscRings`). */
  readonly ringBlobsPerRing: number;
  /** Each ring's radial Gaussian sigma, a fraction of outerRadius. */
  readonly ringRadialSigmaFrac: number;
  /** Azimuthal blob-to-blob overlap; 1.0 sets a blob's sigma to its own ring spacing. */
  readonly ringAzimuthalOverlap: number;
  /** Geometric ratio of each ring's flux to the previous (inner-to-outer) ring's; 1.0 splits flux evenly. */
  readonly ringFluxFalloff: number;
  /**
   * Debug knob: divides all three of a blob's sigmas, holding its flux, so
   * the ring separates into countable oriented blobs. 1 is the real field.
   */
  readonly ringBlobSharpness: number;
  /** Master toggle for `pushArmRidges`, mirrored to the section header checkbox. */
  readonly armsEnabled: boolean;
  /** Blobs per arm, spaced uniformly in log-radius from `armStartRadius` to that arm's own `fadeRadius`. */
  readonly armBlobsPerArm: number;
  /** Multiplies every blob's across-arm (radial) sigma; 1 matches `armWidthFactor`'s own scale. */
  readonly armWidthScale: number;
  /** Whole-arm-population flux multiplier over the un-folded `armFraction` share; 1 is parity with the sprite arms. */
  readonly armFluxBoost: number;
  /**
   * Debug knob, same idiom as `ringBlobSharpness`: divides all three of an
   * arm blob's sigmas, holding its flux, so the ridge breaks into countable
   * oriented blobs. 1 is the real field.
   */
  readonly armBlobSharpness: number;
};
