/** The mark legend: the shapes the track lanes draw, by the class that paints each swatch. */
export const MARK_LEGEND = [
  { shape: 'bar', name: 'move' },
  { shape: 'diamond', name: 'cue' },
  { shape: 'hollow', name: 'show · hide' },
  { shape: 'tail', name: 'fade' },
  { shape: 'background', name: 'background' },
] as const;
