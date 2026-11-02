// One row per exhibit, in the app's order; `accent` is a colour from its own picture. The first is shown first.
export const EXHIBITS = [
  { name: 'Cosmic Flows', shot: 'dome-exhibit', accent: '#8fb2ff' },
  { name: 'Solar System', shot: 'class-exhibit', accent: '#e2c27f' },
  { name: 'Cosmic Web', shot: 'domes-exhibit-web', accent: '#d98fe6' },
  { name: 'Zone of Avoidance', shot: 'domes-exhibit-zoa', accent: '#aaa6ff' },
  { name: 'Observable Universe', shot: 'domes-exhibit-universe', accent: '#b8d4ff' },
];
// The picture is set half as wide again as its frame, which cuts off the notes (`.frame` in the module).
export const SIZES = '(max-width: 900px) 150vw, min(calc(88vw + 14rem), 82rem)';
