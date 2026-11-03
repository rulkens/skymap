import type { SiteShotSettings } from '../@types/SiteShotSettings';

// The settings that switch on a layer the app starts with off. No link can switch one on (the app's hash
// carries focus, t, orientation and pose: src/state/url/hashParamSources.ts), so a shot that needs one gets
// no link until the app reads a `layers=` parameter (utils/shotLink.ts).
export const UNLINKABLE_LAYERS = [
  'filaments',
  'desiWedge',
  'missionTrails',
  'constellations',
  'flow',
] as const satisfies readonly (keyof SiteShotSettings)[];
