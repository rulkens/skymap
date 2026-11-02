// One row per exhibit, in the app's order; `accent` is a colour from its own picture. The first is shown first.
export const EXHIBITS = [
  { name: 'Cosmic Flows', shot: 'dome-exhibit', accent: 'var(--site-accent-earth)' },
  { name: 'Solar System', shot: 'class-exhibit', accent: 'var(--site-accent-orbits)' },
  { name: 'Cosmic Web', shot: 'domes-exhibit-web', accent: 'var(--site-accent-web)' },
  { name: 'Zone of Avoidance', shot: 'domes-exhibit-zoa', accent: 'var(--site-accent-zoa)' },
  {
    name: 'Observable Universe',
    shot: 'domes-exhibit-universe',
    accent: 'var(--site-accent-universe)',
  },
];
// The picture is set half as wide again as its frame, which cuts off the notes (`.frame` in the module).
export const SIZES = '(max-width: 900px) 150vw, min(calc(88vw + 14rem), 82rem)';
