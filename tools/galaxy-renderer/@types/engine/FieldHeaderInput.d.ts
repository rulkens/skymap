/**
 * FieldHeaderInput — everything one `FieldUniforms` header needs, all of it
 * per-pass. `packFieldHeaderUniforms` is the only reader.
 */

import type { Vec2 } from '../../../../src/@types/math/Vec2';

import type { DebugViewWeights } from './DebugViewWeights';
import type { FieldCamera } from './FieldCamera';
import type { FieldDust } from './FieldDust';
import type { HiiTextureLanes } from './HiiTextureLanes';
import type { SfMapChannelWeights } from './SfMapChannelWeights';

export type FieldHeaderInput = {
  readonly camera: FieldCamera;
  /** The draw call's own instance count — dust components are never drawn as quads. */
  readonly emissionCount: number;
  /**
   * The CENTRAL galaxy's share of `emissionCount` (its components pack first).
   * splat.wesl gates dust application on it, so an extra's emission can never
   * read the primary's dust; 0 keeps a whole pass out of the attenuation branch.
   */
  readonly primaryCount: number;
  /**
   * The pixel size of THIS pass's own target (fieldTex for the field header,
   * hiiTex for the HII one) — not the canvas, and not dustMapTex, which carries
   * its own divisor. splat.wesl's fs turns a fragment position into a normalized
   * dustMapTex UV with it (io.wesl's DUST MAP doc).
   */
  readonly targetSizePx: Vec2;
  /** Absent means the pass has no dust; the lanes are still written, inert. */
  readonly dust?: FieldDust;
  /**
   * Absent means the pass draws no HII texture — packed 0/1 (scale/contrast),
   * which is what lets splat.wesl's fs skip the noise sample on a UNIFORM
   * branch. Only the HII draw's own header (`model.hiiTexture`) passes real
   * values; the primary field draw's own components never carry a nonzero
   * `textureWeight`, so leaving this absent costs it nothing.
   */
  readonly hiiTexture?: HiiTextureLanes;
  readonly debugViews: DebugViewWeights;
  /**
   * `1 - max(every view weight)`, clamped to 0 — see `debugGalaxyWeight`. Not a
   * member of `debugViews` because it is not a view; it is what the galaxy is
   * left with once they have taken their share.
   */
  readonly galaxyWeight: number;
  readonly sfMapChannels: SfMapChannelWeights;
};
