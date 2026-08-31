/**
 * Slab — a scale-separated depth range plus the projection that goes with it.
 *
 * A depth buffer has finite precision (~1 part in 2²³), and a perspective
 * projection crams most of that precision near the near plane — the usable
 * near/far ratio before opaque surfaces z-fight is only ~1e5-1e6. Skymap's
 * full range (Earth at near-field scale out to distant galaxies) spans
 * roughly `far/near ≈ 5e16`, which no single depth buffer can hold. The fix
 * is to slice depth into slabs: each slab gets its own near/far sized to
 * its own content, and therefore the full precision of the depth buffer for
 * that range. Slabs composite far-to-near, so drawing higher-index slabs
 * first and lower-index slabs on top of them IS inter-slab occlusion — no
 * separate occlusion mechanism is needed.
 *
 * This is one of three independent axes a content layer is positioned on
 * (the other two are the render target and the blend mode — see
 * `ContentLayer` and the "Core concepts" section of the renderer
 * unification design). A layer names its slab by a plain `slab: number`
 * index into the per-frame slab list; there is deliberately no
 * `ContentSpace` wrapper type, because the slab table already holds every
 * per-slab attribute and the index alone is a sufficient reference.
 *
 * The type is N-capable by construction: adding a third slab (e.g. for an
 * adaptive slab set during a zoom descent) is one more table entry and one
 * more matching render target, not a new code path. See the renderer
 * unification design's "Slab" section for the concrete two-slab
 * instantiation (near-field bodies + cosmological scene) this spec ships.
 */

import type { SlabFrame } from './SlabFrame';

export type Slab = {
  /** 0 = nearest; higher = farther back. Composite order is high-to-low. */
  readonly index: number;
  /** Near plane, in THIS slab's units (see `frame.kind`). */
  readonly near: number;
  /** Far plane, in THIS slab's units. Ignored under infinite-far reversed-Z. */
  readonly far: number;
  /** proj·view. For `body-m`, built about the eye — RTC-native, no rebase step. */
  readonly vp: Float64Array;
  /** The frame and units `vp` and this slab's geometry are expressed in. */
  readonly frame: SlabFrame;
  /**
   * Camera-distance interval, in METRES, spanned by the depth-bearing content
   * this row contributes. Metres for EVERY row (including `world-mpc` ones) so
   * the painter sort compares across frames without a per-row unit branch.
   */
  readonly distanceRangeM: readonly [number, number];
  /** f64 ⇒ MVP is composed in double precision, then narrowed (composeBodyMvp path). */
  readonly precision: 'f32' | 'f64';
  /** true ⇒ this slab clears depth to 0, greater-wins, perspectiveReverseZ projection. */
  readonly reversedZ: boolean;
};
