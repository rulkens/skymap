/**
 * ANTIQUE_GLOBE_TITLES — the cartouche title a globe takes once it is the
 * plate's subject (`antiqueGlobePlateWeight`). Earth and Mars take theirs once
 * a whole disc sits on the plate; Saturn and Jupiter while still small, a system
 * with its moons, as Huygens drew Saturn's. The Moon keeps the default band,
 * on which its plate also fades the sky's rulings and figures; airless, it stays the
 * subject from its own ground once that covers `groundCover` of the plate (earthrise).
 */

import type { AntiqueTitleKey } from '../../@types/rendering/AntiqueTitleKey';

export const ANTIQUE_GLOBE_TITLES: Readonly<
  Record<
    string,
    {
      readonly key: AntiqueTitleKey;
      readonly span?: readonly [number, number];
      readonly groundCover?: readonly [number, number];
    }
  >
> = {
  earth: { key: 'orbis', span: [0.12, 0.25] },
  moon: { key: 'luna', groundCover: [0.1, 0.2] },
  mars: { key: 'mars', span: [0.12, 0.25] },
  jupiter: { key: 'iupiter', span: [0.05, 0.1] },
  saturn: { key: 'saturnus', span: [0.05, 0.1] },
};
