/**
 * ANTIQUE_MOON_PLACE_REVEAL — when a Moon name shows. Every name fades in with the disc
 * (`discPx`, as Earth's `globePx`). A mare or Terra shows while its box fits its extent
 * as seen, the far side of the limb clipped off (`fitPx` of room), and both ends of the
 * box are lit (`sunCos.area`). A crater shows once its diameter reaches
 * `craterPx[0] * craterPx[1] ** rank` px (fully in at `revealGrow` times that), its
 * foreshortening is below `facing`, and its centre and the far end of its name are lit
 * (`sunCos.crater`): the Moon has no twilight, so the night keeps none.
 */

export const ANTIQUE_MOON_PLACE_REVEAL = {
  discPx: [200, 250],
  fitPx: [-8, 2],
  sunCos: { area: [0.06, 0.12], crater: [0, 0.05] },
  facing: [0.06, 0.12],
  craterPx: [3.5, 1.035],
  revealGrow: 1.15,
  // A crater name fits on the floor when it spans at most this share of the crater as
  // seen; it then sits this share of the way from the centre to the south wall.
  insideFrac: 0.55,
  floorDrop: 0.5,
  gapPx: 2,
  // Crater diameter (px) over which its italic grows from its lettering's px to `px`.
  craterTypeGrow: { fromPx: 140, toPx: 320, px: 15 },
  lineEm: 1.15,
} as const;
