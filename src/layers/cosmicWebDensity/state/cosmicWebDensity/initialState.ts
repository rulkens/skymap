/**
 * Master toggle for the 3D scalar-field volume overlay defaults ON so the
 * overlay is ready to render as soon as the first field is added — the user
 * doesn't have to hunt for a master toggle to see anything. At startup no
 * fields are registered yet (a volume slot commit must load a cube first),
 * so this default has no visual effect until the first field arrives.
 */

import { seedVolumeFields } from '../../../../data/volume/volumeFieldDefaults';
import type { CosmicWebDensitySettings } from '../../../../@types/settings/CosmicWebDensitySettings';

export const initialState: CosmicWebDensitySettings = {
  enabled: true,
  items: seedVolumeFields(),
};
