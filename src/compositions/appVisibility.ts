/**
 * Every composed Layer's visibility entries, in `APP_COMPOSITION` order: the one source the
 * address types (`ShowKey`, `VisibilityAddress`, …) derive from. Imported from each Layer's
 * own `visibility.ts`, never read off `APP_COMPOSITION`: that would make the settings root
 * type depend on the Layer types, which depend on it (`ContentPass` → `PassState`), a
 * circular alias `tsc` refuses and tsgo does not see. A test pins it to the composition.
 */

import type { LabelEntry } from '../@types/engine/layer/LabelEntry';
import type { ShowEntry } from '../@types/engine/layer/ShowEntry';
import type { ShowKey } from '../@types/animation/ShowKey';
import { blackHolesVisibility } from '../layers/blackHoles/visibility';
import { bodyVisibility } from '../layers/body/visibility';
import { constellationsVisibility } from '../layers/constellations/visibility';
import { cosmicWebDensityVisibility } from '../layers/cosmicWebDensity/visibility';
import { cosmicWebFilamentsVisibility } from '../layers/cosmicWebFilaments/visibility';
import { flowVisibility } from '../layers/flow/visibility';
import { galaxyCatalogVisibility } from '../layers/galaxyCatalog/visibility';
import { lightTimeVisibility } from '../layers/lightTime/visibility';
import { localBubbleVisibility } from '../layers/localBubble/visibility';
import { milkyWayVisibility } from '../layers/milkyWay/visibility';
import { missionsVisibility } from '../layers/missions/visibility';
import { starCatalogVisibility } from '../layers/starCatalog/visibility';
import { structureVisibility } from '../layers/structure/visibility';
import { zoneOfAvoidanceVisibility } from '../layers/zoneOfAvoidance/visibility';

export const APP_VISIBILITY = [
  ...galaxyCatalogVisibility,
  ...starCatalogVisibility,
  ...cosmicWebDensityVisibility,
  ...cosmicWebFilamentsVisibility,
  ...flowVisibility,
  ...missionsVisibility,
  ...zoneOfAvoidanceVisibility,
  ...localBubbleVisibility,
  ...lightTimeVisibility,
  ...constellationsVisibility,
  ...blackHolesVisibility,
  ...milkyWayVisibility,
  ...structureVisibility,
  ...bodyVisibility,
] as const;

// A misspelled `of` fails here: the entry types cannot name `ShowKey` themselves.
APP_VISIBILITY satisfies readonly (ShowEntry | (LabelEntry & { readonly of?: ShowKey }))[];
