/**
 * The three words the site sorts everything it shows into, each with one
 * meaning across the site (08, house style), and the picture that stands for
 * each on Home.
 */
export const HONESTY_BINS = [
  { id: 'measured', shot: 'galaxies-measured', title: 'Measured', gloss: 'An instrument recorded it.' },
  { id: 'derived', shot: 'filaments-derived', title: 'Derived', gloss: 'Computed from measurements by a stated method.' },
  {
    id: 'drawn',
    shot: 'milky-way-drawn',
    title: 'Drawn',
    gloss: 'A model or a choice of ours, with no measurement behind each object.',
  },
] as const;
