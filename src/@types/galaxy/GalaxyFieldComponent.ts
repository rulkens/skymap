/**
 * GalaxyFieldComponent — one Gaussian blob of the analytic galaxy emission
 * field (`milkyWay/field/fieldSplat/` and `hiiSplat/`). Lengths are GENERATOR
 * units (Milky Way preset: 1 unit = 1.6667 kpc); disc plane is XZ, pole +Y.
 * Shape is carried as the inverse covariance M of
 * exp(-0.5*(p-center)^T*M*(p-center)) rather than sigmas plus a tilt: a
 * component's own warp shear tilts it out of any axis-aligned frame, and a
 * general symmetric M is the only form closed under that (see
 * `galaxyFieldInverseCovariance`).
 */
import type { Vec3 } from '../math/Vec3';

export type GalaxyFieldComponent = {
  /** Peak emissivity, relative — the mixture is normalised by an exposure knob, not physically. */
  readonly amplitude: number;
  /** (m00, m11, m22) of M, in 1/length^2. */
  readonly invCovDiagonal: Readonly<Vec3>;
  /** (m01, m02, m12) of M — m01 and m12 are nonzero only where the warp shears. */
  readonly invCovOffDiagonal: Readonly<Vec3>;
  /** Linear RGB tint, multiplied into this component's integrated emission. */
  readonly color: Readonly<Vec3>;
  /** World-space centre of exp(-0.5*(p-center)^T*M*(p-center)); [0,0,0] for an origin-centred component. */
  readonly center: Readonly<Vec3>;
  /**
   * World-space bounding radius (max sigma, warp-inflated where applicable) —
   * a billboard sizing hint for the splat render path, not part of the
   * Gaussian's own math. See `galaxyFieldMixture.ts`'s push sites.
   */
  readonly boundRadius: number;
  /**
   * Magnitude (0..1+) how strongly this component's own emission is
   * modulated by the HII tier's tier-global noise texture (`hiiNoise.wesl`'s
   * `hiiNoiseTerm`) — packed to `comps[4i+2].w`. The SIGN picks WHICH texture
   * (`field/io.wesl`'s comps doc): positive (shell, DIG) samples
   * `dustNoiseTex`'s ridged ISM field, negative (young stars) samples
   * `starGrainTex`'s uncorrelated point grains. Optional, default 0.
   */
  readonly textureWeight?: number;
  /**
   * 0..1 how strongly this component's own emission is modulated by the ISM
   * map's `stars` tracer — packed to `comps[4i+3].w`. Optional, default 0;
   * only `youngStarChain.ts`'s pushes set it (`GalaxyYoungStarsTuning.mapDepth`).
   */
  readonly starsWeight?: number;
};
