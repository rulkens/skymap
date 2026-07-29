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
 * control kind with the field list. The STAR COUNT is absent for a harder
 * reason — it feeds generation, not the per-frame uniforms, so a live slider
 * over it would move nothing until the next tier switch.
 */
import type { MilkyWayTuning } from '../../@types/settings/MilkyWayTuning';
import type { MilkyWaySliderKey } from '../../@types/data/milkyWay/MilkyWaySliderKey';
import type { MilkyWaySliderField } from '../../@types/data/milkyWay/MilkyWaySliderField';

export const MILKY_WAY_SLIDER_FIELDS: readonly MilkyWaySliderField[] = [
  {
    key: 'starSizeScale',
    label: 'starSize',
    min: 0,
    // Up to ~28x the 0.7 default. The count/size trade only becomes visible
    // once sprites are big enough to overlap several per pixel, which is an
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
    // makes that bottom end reachable; the 0.5 ceiling still allows ~4.5x
    // brighter than the 0.11 default.
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
    title: 'Sprite half-extent floor, in mw-aggregate pixels (= 2 screen px).',
  },
  {
    key: 'starPxMax',
    label: 'pxMax',
    min: 1,
    // The star pass renders into the HALF-RES `mw-aggregate` target and the
    // shader clamps in TARGET pixels, so this ceiling is 512 SCREEN px — a
    // sprite covering most of the viewport. Anything much past it is a frame
    // rate in the single digits rather than a look worth seeing.
    max: 256,
    step: 1,
    format: (v) => String(Math.round(v)),
    title: 'Sprite half-extent cap, in mw-aggregate pixels (= 2 screen px).',
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
];

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
