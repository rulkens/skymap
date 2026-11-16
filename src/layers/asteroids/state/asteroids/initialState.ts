/** Off by default; every class starts on, so switching the Layer on shows them all. */
import type { AsteroidsSettings } from '../../@types/AsteroidsSettings';

export const initialState: AsteroidsSettings = {
  enabled: false,
  items: {
    nearEarth: { enabled: true },
    mainBelt: { enabled: true },
    hilda: { enabled: true },
    jupiterTrojan: { enabled: true },
  },
  brightness: 1,
};
