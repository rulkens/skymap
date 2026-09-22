/**
 * Constellation stick-figure overlay defaults. Off by default — at survey
 * scales the stick figures shear into visual noise; users opt in via the
 * SettingsPanel. 1.0 is the unit intensity baseline.
 */

import type { ConstellationsSettings } from '../../../../@types/settings/ConstellationsSettings';

export const initialState: ConstellationsSettings = {
  enabled: false,
  intensity: 1.0,
};
