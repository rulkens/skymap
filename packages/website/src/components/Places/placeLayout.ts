/*
 * placeLayout — where each of Home's nine places stands in its field. Every
 * position and size is in widths of the field (`cqw`), so the line, an SVG in
 * the same units, always passes through the disc centres. `TALL` zigzags down
 * an upright screen, `WIDE` across a wide one.
 */

// Disc diameters, nearest first, in units of a field 100 wide.
const TALL_SIZES = [30, 32, 34, 36, 38, 41, 44, 47, 52];
// How far a disc stands in from its edge of the field, so the zigzag is not ruled.
const TALL_INSET = [0, 3, 5, 0, 0, 0, 2, 3, 0];
// Room between a disc and the one before it, on top of half their radii: the height of the labels that meet there.
const TALL_STEP = [0, 19, 19, 19, 21, 28, 25, 21, 22];
const TALL_GAP = 5;

// Multiplied, not divided: a slash after `!` reads as the start of a pattern to `astro check`.
let tallY = TALL_SIZES[0]! * 0.5;
export const TALL = TALL_SIZES.map((d, i) => {
  if (i > 0) tallY += (TALL_SIZES[i - 1]! + d) * 0.25 + TALL_STEP[i]!;
  const left = i % 2 === 0;
  const x = left ? TALL_INSET[i]! + d * 0.5 : 100 - TALL_INSET[i]! - d * 0.5;
  return {
    x,
    y: tallY,
    d,
    side: left ? ('left' as const) : ('right' as const),
    room: 100 - d - TALL_INSET[i]! - TALL_GAP,
  };
});
export const TALL_HEIGHT = tallY + TALL_SIZES.at(-1)! * 0.5;

// Centre x, centre y and diameter in units of a field 1000 wide. The upper row carries its labels above and
// the lower row below, so the line between the rows never crosses a word; `hang` is how a label sits on its disc.
export const WIDE_HEIGHT = 580;
export const WIDE = [
  { x: 42, y: 130, d: 84, row: 'upper', hang: 'start' },
  { x: 146, y: 290, d: 92, row: 'lower', hang: 'center' },
  { x: 250, y: 140, d: 102, row: 'upper', hang: 'center' },
  { x: 356, y: 325, d: 112, row: 'lower', hang: 'center' },
  { x: 462, y: 150, d: 124, row: 'upper', hang: 'center' },
  { x: 572, y: 388, d: 136, row: 'lower', hang: 'center' },
  { x: 682, y: 185, d: 150, row: 'upper', hang: 'center' },
  { x: 796, y: 420, d: 164, row: 'lower', hang: 'center' },
  { x: 908, y: 180, d: 184, row: 'upper', hang: 'end' },
] as const;

// How many pixels each disc drifts, up or down, while the field crosses the screen.
export const DEPTHS = [-8, 12, -16, 9, -13, 18, -9, 14, -18];
