/**
 * ANTIQUE_MOON_PLACE_REVEAL — when a Moon name shows. Every name fades in with the disc
 * (`discPx`, as Earth's `globePx`). A mare or Terra shows while its box fits its extent
 * as seen or square-on (`fitPx` of room), its anchor faces the eye (`facing`) and both
 * ends of the box are lit (`sunCos.area`). A crater shows once its diameter reaches
 * `craterPx[0] * craterPx[1] ** rank` px (fully in at `revealGrow` times that), its
 * foreshortening is below `facing`, and its centre and the far end of its name are lit
 * (`sunCos.crater`): the Moon has no twilight, so the night keeps none.
 */

export const ANTIQUE_MOON_PLACE_REVEAL = {
  discPx: [200, 250],
  fitPx: [-8, 2],
  // A mare's name shrinks to this share of its type before a narrow sea drops it.
  areaShrink: 0.72,
  sunCos: { area: [0.06, 0.12], crater: [0, 0.05] },
  facing: [0.06, 0.12],
  craterPx: [3.5, 1.035],
  revealGrow: 1.15,
  gapPx: 2,
  // Crater diameter (px) over which its italic grows from its lettering's px to `px`.
  craterTypeGrow: { fromPx: 120, toPx: 320, px: 18 },
  // A crater name's size per unit of its rim's print weight over 1, within `range`.
  craterWeightType: { perWeight: 0.5, range: [0.85, 1.15] },
  lineEm: 1.15,
} as const;
