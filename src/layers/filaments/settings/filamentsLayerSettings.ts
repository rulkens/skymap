/**
 * The Layer's settings tuple — ONE authority, two readers: `layer.ts` and
 * `appSettingsFragments`, which folds it in from HERE for the circular-alias
 * reason that file's header spells out.
 */

import { filamentsSettingsFragment } from './filamentsSettings';

export const filamentsLayerSettings = [filamentsSettingsFragment] as const;
