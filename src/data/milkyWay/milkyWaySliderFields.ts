/**
 * MILKY_WAY_SLIDER_FIELDS — the one enumeration of the Milky-Way star cloud's
 * tuning knobs, with the UI metadata each needs.
 *
 * Same shape and same reason as `data/flow/flowFields.ts`: label, range,
 * granularity and value formatting live in ONE registry row per knob, and the
 * DebugPanel section *iterates* this list rather than re-spelling six sliders
 * by hand. A new knob is one row here plus its `MilkyWayTuning` leaf — the
 * panel picks it up for free, and the parity test in
 * `tests/data/milkyWay/milkyWaySliderFields.test.ts` fails if a leaf is added
 * without a row.
 *
 * The RANGES are the interesting content. These knobs exist to answer "does
 * the star field read as a smooth galaxy or as visible particles?", and the
 * hypothesis under test is that a much larger, much dimmer-per-sprite splat
 * reads smoother than many tight ones (the Celestia / Space Engine model:
 * a few thousand large soft billboards sampled from a density model, where
 * each sample already carries a smooth spatial profile so only a handful need
 * to overlap per pixel). Ranges of ±20% around the defaults could not reach
 * that regime, so `starSizeScale` and `exposure` span more than an order of
 * magnitude around theirs.
 *
 * `enabled` / `labelEnabled` are deliberately NOT here: boolean visibility
 * axes aren't sliders, and forcing them into a slider row would complect the
 * control kind with the field list. The bar for everything else is that moving
 * it changes the NEXT frame. `aggregateDivisor` clears that bar by having the
 * frame loop reallocate the star pass's offscreen when the setting no longer
 * matches the table in force, even though it isn't a uniform. `starCount`
 * clears it the same way — the frame loop compares the live setting against
 * the count the cloud's current buffers were generated with, and regenerates
 * on a mismatch — but the reaction is heavier: a full regeneration (destroy +
 * allocate + compute dispatch) rather than a render-target rebuild.
 */
import type { MilkyWayTuning } from '../../@types/settings/MilkyWayTuning';
import type { MilkyWaySliderKey } from '../../@types/data/milkyWay/MilkyWaySliderKey';
import type { MilkyWaySliderField } from '../../@types/data/milkyWay/MilkyWaySliderField';

export const MILKY_WAY_SLIDER_FIELDS: readonly MilkyWaySliderField[] = [
  {
    key: 'starSizeScale',
    label: 'starSize',
    min: 0,
    // ~11x the default. The count/size trade only becomes visible once
    // sprites are big enough to overlap several per pixel, which is an
    // order-of-magnitude move, not a trim.
    max: 20,
    step: 0.05,
    format: (v) => v.toFixed(2),
    title: 'Sprite world-size scale. Sprite AREA grows as its square.',
  },
  {
    key: 'exposure',
    label: 'exposure',
    min: 0,
    // Absolute, with no auto-compensation for size: under additive blending
    // total light goes as roughly count * exposure * size^2, so a 20x size
    // needs ~1/400th the exposure to hold brightness. The fine step is what
    // makes that bottom end reachable; the 0.5 ceiling still allows ~13x
    // brighter than the default.
    max: 0.5,
    step: 0.0005,
    format: (v) => v.toFixed(4),
    title: 'Emission factor. Absolute — raising starSize does NOT dim it for you.',
  },
  {
    key: 'starPxMin',
    label: 'pxMin',
    min: 0,
    max: 8,
    step: 0.25,
    format: (v) => v.toFixed(2),
    title: 'Sprite half-extent floor, in mw-aggregate pixels (x divisor = screen px).',
  },
  {
    key: 'starPxMax',
    label: 'pxMax',
    min: 1,
    // The star pass renders into the REDUCED-RES `mw-aggregate` target and the
    // shader clamps in TARGET pixels, so this ceiling is 256 x `aggregateDivisor`
    // SCREEN px — a sprite covering most of the viewport. Anything much past it
    // is a frame rate in the single digits rather than a look worth seeing.
    max: 256,
    step: 1,
    format: (v) => String(Math.round(v)),
    title: 'Sprite half-extent cap, in mw-aggregate pixels (x divisor = screen px).',
  },
  {
    key: 'softness',
    label: 'softness',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
    title: '0 = tight core+glow profile, 1 = broad Gaussian. Equal integral either way.',
  },
  {
    key: 'lodApparent',
    label: 'lod',
    min: 0,
    // 0 disables the cull entirely — the setting the smoothness experiment
    // wants, since the LOD culls and 3x-boosts survivors, manufacturing
    // exactly the graininess under test. 0.2 is 10x the default, well past
    // where the cull eats the visible field.
    max: 0.2,
    step: 0.001,
    format: (v) => v.toFixed(3),
    title: 'Flux-conserving LOD threshold in NDC. 0 disables the vertex-stage cull.',
  },
  {
    key: 'aggregateDivisor',
    label: 'divisor',
    // 1 is full resolution — the reference the reduced-resolution row's
    // reconstruction has to be judged against.
    min: 1,
    // 6 already leaves the star pass 1/36th of its fragments; past that the
    // upsample is reconstructing the disc from a target coarser than the
    // structure in it, and the smoothness the row exists to buy turns to mush.
    max: 6,
    step: 1,
    format: (v) => String(Math.round(v)),
    title:
      'Downsample divisor for the mw-aggregate offscreen. Fragment cost falls as its square. pxMin/pxMax clamp in TARGET pixels, so doubling this doubles a clamped sprite on screen.',
  },
  {
    key: 'starCount',
    label: 'count',
    // `totalStarBudget` floors the TOTAL at 20,000 stars regardless of what's
    // requested — this IS that floor, not a taste choice. A lower `min` would
    // let the slider display a number the renderer silently ignores; if the
    // floor in `totalStarBudget` ever moves, this must move with it.
    min: 20000,
    // 4x the medium tier's default budget is already a heavy regenerate (see
    // the runFrame branch's cost note); past that the count/size trade this
    // row exists to explore is well into "many tight sprites", the opposite
    // end from what the smoothness experiment wants.
    max: 600000,
    step: 5000,
    format: (v) => Math.round(v).toLocaleString(),
    title:
      'Absolute star count — regenerates the cloud (destroy + allocate + compute dispatch), not a uniform write. totalStarBudget floors the total at 20,000 stars.',
  },
];

/**
 * The "Celestia end" of the count/size trade-off — few thousand large, dim,
 * soft splats rather than many tight ones — reached by pushing four of these
 * rows at once rather than `starCount` alone:
 *
 *   starCount      ~20,000  (the floor — as few splats as the renderer allows)
 *   starSizeScale   way up  (fewer splats need to be much bigger to cover the sky)
 *   exposure        way down (absolute — nothing dims it for you as size grows)
 *   lodApparent     0        (disables the cull; the LOD 3x-boosts survivors,
 *                             which manufactures exactly the graininess a low
 *                             starCount is meant to test)
 *   softness        1        (the broad Gaussian profile, not the tight core+glow)
 */

/**
 * Build a `MilkyWayTuning` patch for one slider field. The cast is sound:
 * every `MilkyWaySliderKey` addresses a number-valued leaf, but a
 * computed-key object literal widens to `{ [k: string]: number }`, which the
 * compiler won't narrow on its own. Localising the cast here keeps the
 * section component type-clean — the same trick `flowSliderPatch` uses.
 */
export function milkyWaySliderPatch(
  key: MilkyWaySliderKey,
  value: number,
): Partial<MilkyWayTuning> {
  return { [key]: value } as Partial<MilkyWayTuning>;
}
