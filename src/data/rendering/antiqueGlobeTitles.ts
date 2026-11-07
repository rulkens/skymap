/**
 * ANTIQUE_GLOBE_TITLES — the cartouche title a globe takes once it is the
 * plate's subject (`antiqueGlobePlateWeight`). Earth and Mars take theirs once
 * a whole disc sits on the plate; Saturn and Jupiter while still small, a system
 * with its moons, as Huygens drew Saturn's. The Moon keeps the default band,
 * on which its plate also fades the sky's rulings and figures.
 */

import type { AntiqueTitleKey } from '../../@types/rendering/AntiqueTitleKey';

export const ANTIQUE_GLOBE_TITLES: Readonly<
  Record<string, { readonly key: AntiqueTitleKey; readonly span?: readonly [number, number] }>
> = {
  earth: { key: 'orbis', span: [0.12, 0.25] },
  moon: { key: 'luna' },
  mars: { key: 'mars', span: [0.12, 0.25] },
  jupiter: { key: 'iupiter', span: [0.05, 0.1] },
  saturn: { key: 'saturnus', span: [0.05, 0.1] },
};
