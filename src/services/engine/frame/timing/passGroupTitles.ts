/**
 * PASS_GROUP_TITLES — groupKey → human group title, the value order fixing the
 * display order (see `groupRows`). Steps sharing a title merge into one
 * scannable seam even when non-adjacent in execution order — that is why the
 * volume raymarch and the two aggregate offscreens, or the two composites and
 * pick, each collapse to one group. A groupKey with no entry here degrades to
 * its raw key as the title, so a genuinely new target/slab step still gets a
 * group rather than vanishing.
 */

import { slabName } from '../slabs';
import { SLAB_ROW_CEILING } from './slabRowCeiling';

export const PASS_GROUP_TITLES: Readonly<Record<string, string>> = {
  // FIRST, because the prelude's dispatches run ahead of every render step and
  // this table's value order is the display order: a reader comparing a slow
  // render row against the frame must see what already ran before it.
  compute: 'Compute prelude',
  'volume·COSMO': 'Volumes & aggregates',
  'zoa·COSMO': 'Volumes & aggregates',
  'star-aggregates·NEAR0': 'Volumes & aggregates',
  'mw-aggregate·NEAR0': 'Volumes & aggregates',
  // A sky capture's bake steps — 0 or 12 per row per frame (COSMO + NEAR0 per
  // face, all six or none), so their own group rather than folding into an
  // existing title. Keyed on the CAPTURE, not its render target.
  'sgrAStar·COSMO': 'Sky capture',
  'sgrAStar·NEAR0': 'Sky capture',
  'solarSystem·COSMO': 'Sky capture',
  'solarSystem·NEAR0': 'Sky capture',
  // The probe's bake steps: the sky under it through COSMO, then its subject's
  // host through whichever body row that host holds this frame.
  'probe·COSMO': 'Probe capture',
  ...Object.fromEntries(
    Array.from({ length: SLAB_ROW_CEILING }, (_, k) => [
      `probe·${slabName(k + 2)}`,
      'Probe capture',
    ]),
  ),
  'hdr·COSMO': 'Cosmos · HDR',
  'hdr·NEAR0': 'Near field · HDR',
  // One `hdr·BODY[k]` row per capacity slot — today only the black-hole lens
  // (`sgrAStarLensingPass`) targets `hdr` on a body-m slab, so every slot
  // buckets under one title regardless of which row Sgr A* lands in this
  // frame, same reasoning as the `foreground:0·BODY[k]` block below.
  ...Object.fromEntries(
    Array.from({ length: SLAB_ROW_CEILING }, (_, k) => [
      `hdr·${slabName(k + 2)}`,
      'Sgr A* lensing',
    ]),
  ),
  'foreground:0·NEAR0': 'Foreground bodies · depth',
  // One `foreground:0·BODY[k]` row per capacity slot, derived from `slabName`
  // rather than authored — a new SCENE_PLANETS row widens SLAB_ROW_CEILING
  // and this table follows with no hand-added line.
  ...Object.fromEntries(
    Array.from({ length: SLAB_ROW_CEILING }, (_, k) => [
      `foreground:0·${slabName(k + 2)}`,
      'Foreground bodies · depth',
    ]),
  ),
  // The bloom sub-pipeline bills one `'bloom'` slot (the whole bright →
  // downsample → upsample → fold span), placed after Foreground and before
  // Overlays so the group renders in that slot.
  bloom: 'Bloom',
  'swap·COSMO': 'Overlays',
  'swap·NEAR0': 'Overlays',
  composite: 'Composites & pick',
  pick: 'Composites & pick',
};
