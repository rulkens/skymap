/**
 * CompositeStep — the data description of one Compositor.draw call: merge
 * a whole offscreen texture into a target with a given blend and optional
 * tone-map.
 *
 * Phase 1 landed the Compositor primitive (`src/@types/rendering/`) as an
 * imperative call with `blend`/`tone` as draw arguments. This type lifts
 * those same parameters into data — plus `source`/`dest` target ids — so a
 * `FrameStep` of kind `'composite'` (see `FrameStep`) can name a whole merge
 * operation without the executor needing bespoke code per merge. `source`
 * and `dest` are `RenderTargetSpec.id` strings (e.g. `'hdr'` → `'swap'`),
 * resolved by the executor to the actual texture views at encode time.
 */

import type { CompositeBlend } from '../../rendering/CompositeBlend';
import type { ToneMap } from '../../rendering/ToneMap';

export type CompositeStep = {
  /** The `RenderTargetSpec.id` of the texture being merged in. */
  source: string;
  /** The `RenderTargetSpec.id` of the texture being merged into. */
  dest: string;
  /** How the source combines with the destination — see `CompositeBlend`. */
  blend: CompositeBlend;
  /** Tone-map curve/exposure to apply, or null for an already-LDR source. */
  tone: ToneMap | null;
};
