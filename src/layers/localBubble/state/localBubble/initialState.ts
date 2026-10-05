/**
 * Off by default for now; when on, the distance window keeps the shell
 * invisible outside ~0.4-10 kpc. No source registry entry to read a
 * default off of.
 */

import type { LocalBubbleSettings } from '../../../../@types/settings/LocalBubbleSettings';

export const initialState: LocalBubbleSettings = {
  enabled: false,
  intensity: 1,
};
