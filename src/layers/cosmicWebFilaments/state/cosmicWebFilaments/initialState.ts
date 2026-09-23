/**
 * Filament overlay defaults. Off by default — the line geometry overlays the
 * cosmic-web wedge and most users want the points-only view first. 1.0 is
 * the unit intensity baseline.
 */

import type { CosmicWebFilamentsSettings } from '../../../../@types/settings/CosmicWebFilamentsSettings';

export const initialState: CosmicWebFilamentsSettings = {
  enabled: false,
  intensity: 1.0,
};
