// The trail in the drawing's units (the face at 100, the baseline at 0), measured off the set word: it starts
// at the y's ball terminal and ends half an em past the p.
export const TRAIL = { from: [92.25, 27.12], bend: [219.2, 43.79], to: [346.2, -4.54] } as const;
// The trail's fade, start to end, at the offsets 0, 0.55 and 1; the press kit's logo files draw the same.
export const FADE = [
  'rgb(232 238 255 / 0.95)',
  'rgb(200 220 255 / 0.45)',
  'rgb(168 208 255 / 0)',
] as const;
// The drawing's box, the word and its trail with room for the stroke.
export const VIEW_BOX = [-2, -82, 352, 113] as const;
