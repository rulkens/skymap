import type { Tier } from '../../src/@types/data/Tier';
import { TIER_LADDER } from '../../src/data/tierLadder';
import { tierToTexturePx } from '../../src/utils/math/tierToTexturePx';

/**
 * tiersFittingSourceWidth — the tiers a source image can produce **without
 * upscaling**, given its pixel width.
 *
 * A tier is producible iff the source is at least as wide as the tier's target
 * edge (`tierToTexturePx`: `small` 2048, `medium` 4096, `large` 8192).
 * Downsampling a wider source to a narrower tier is fine; blowing a narrower
 * source up to a wider tier manufactures detail that is not there — the rule the
 * whole texture pipeline is built to avoid (spec §3).
 *
 * This is the source-cap half of the build's tier decision. `buildTextures.ts`
 * intersects it with `emittedTiersForBody(id)` (the registry policy ceiling):
 * the build emits a tier only when the body *may* ship it AND the source on disk
 * *can* produce it. That intersection is what makes the `--dev` 2 k subset build
 * correctly — a 2048-wide dev JPG yields only `small`; the 5400×2700 NASA Earth
 * dev sibling yields `small` + `medium` but not `large`; a native 8 k+ raw
 * yields all three.
 *
 * Uses the same `TIER_LADDER` as `emittedTiersForBody`; kept in its own file
 * (one exported symbol) so the source-cap rule is unit-testable without any
 * filesystem or sharp call.
 */

export function tiersFittingSourceWidth(sourceWidthPx: number): readonly Tier[] {
  return TIER_LADDER.filter((tier) => tierToTexturePx(tier) <= sourceWidthPx);
}
