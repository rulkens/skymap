/** How a row draws on its track lane; `TRACK_MARKS` maps each to its mark component. */
export type MarkShape =
  | 'start'
  | 'bar'
  | 'cue'
  | 'gap'
  | 'group'
  | 'rate'
  | 'osc'
  | 'composite'
  | 'knot';
