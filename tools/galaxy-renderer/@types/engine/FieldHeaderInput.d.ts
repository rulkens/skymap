/**
 * FieldHeaderInput — everything one `FieldUniforms` header needs, all of it
 * per-pass. `packFieldHeaderUniforms` is the only reader.
 */

import type { Vec2 } from '../../../../src/@types/math/Vec2';

import type { DebugViewWeights } from './DebugViewWeights';
import type { FieldCamera } from './FieldCamera';
import type { FieldDust } from './FieldDust';
import type { HiiTextureLanes } from './HiiTextureLanes';
import type { IsmMapChannelWeights } from './IsmMapChannelWeights';
import type { IsmMapSeedingLanes } from './IsmMapSeedingLanes';
import type { YoungStarsLanes } from './YoungStarsLanes';

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
   * The pixel size of THIS pass's own target (`fieldTex` for the field
   * header, `hiiTex` for the `hii:extras` one, each `HII_TIERS` tier's own
   * texture for its own header) — not the canvas, and not dustMapTex, which
   * carries its own divisor. Feeds `counts2.w`, which splat.wesl's fs reads
   * for its footprint gates AND turns a fragment position into a normalized
   * dustMapTex UV with (io.wesl's DUST MAP doc) — so this must always be the
   * pass's REAL resolution, never borrowed from a sibling pass sharing the
   * same `comps` buffer.
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
  readonly ismMapChannels: IsmMapChannelWeights;
  /** Absent means this pass's `bubbleView` carries no seeding overlay — packed inert (all 0), same idiom as `dust`/`hiiTexture`. Only the FIELD header (not the HII one) passes real values: ismMapPresent.wesl binds the field header alone. */
  readonly ismMapSeeding?: IsmMapSeedingLanes;
  /**
   * Absent means this pass draws no young-stars chain — packed to a neutral
   * (1, 1) so splat.wesl's shaped-read multiply is a no-op if ever reached.
   * Only the HII header (`model.youngStars`) carries real values, same
   * asymmetry `hiiTexture` documents above: the field draw's own components
   * never carry a nonzero `starsWeight`.
   */
  readonly youngStars?: YoungStarsLanes;
  /**
   * `render.starGrainFeatureScale` — packs to `io.wesl`'s free `dustDetail.w`
   * lane (that struct's own doc), the multiplier `splat.wesl`'s
   * `starGrainTerm` applies to the baked star-grain point's fixed sigma to
   * get its per-octave band-limit's feature size. Absent packs 0, the same
   * "only the HII header carries a real value" asymmetry as `hiiTexture`/
   * `youngStars` above — harmless, since a pass with no nonzero
   * `textureWeight` component never reaches `starGrainTerm` either.
   */
  readonly starGrainFeatureScale?: number;
};
