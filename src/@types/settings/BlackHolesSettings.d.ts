import type { BlackHoleId } from '../data/blackHole/BlackHoleId';
import type { BlackHoleItemSettings } from './BlackHoleItemSettings';

/** BlackHolesSettings — the blackHoles Layer's `settings.blackHoles` cluster. */
export type BlackHolesSettings = {
  readonly items: Readonly<Record<BlackHoleId, BlackHoleItemSettings>>;
};
