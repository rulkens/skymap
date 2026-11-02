// The case behind a flat device: as many slices as the phone's, one pixel apart. The phone draws its own.
export const SLICES = 9;

export const PARTS = [
  {
    kind: 'phone',
    title: 'Phone',
    note: 'In the phone’s browser, moved with your fingers.',
  },
  {
    kind: 'tablet',
    title: 'Tablet',
    note: 'The same view on a larger touch screen.',
  },
  {
    kind: 'desktop',
    title: 'Desktop',
    note: 'The full app, with a mouse and a keyboard.',
  },
  {
    kind: 'dome',
    title: 'Dome',
    note: 'A fisheye picture for a planetarium dome, steered from a phone.',
  },
] as const;
