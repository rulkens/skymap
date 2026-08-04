/**
 * DEFAULT_GALAXY_PARAMS — the tool's boot generation preset.
 *
 * This tool exists to tune the app's Milky Way star cloud, so it boots
 * straight into the app's own Milky Way rather than a generic spiral: any
 * other boot state costs a manual gallery pick (`REFERENCE_GALAXIES`'s `mw`
 * entry) before a single measurement or visual comparison is valid.
 *
 * Re-exported from `MILKY_WAY_GALAXY_PARAMS`
 * (`src/data/milkyWay/milkyWayGalaxyParams.ts`), NOT copied — that constant
 * is already the single source of truth shared by the app's `milkyWay/sprites`
 * generation and this tool's reference gallery (see that file's header and
 * `referenceGalaxies.ts`'s `mw` entry). Pointing the boot state at the same
 * object means the tool's default render and the gallery's "Milky Way
 * (model)" entry can never quietly disagree — the Viewport seeds the engine
 * from this constant, and the params store slice seeds its initial state
 * from the same constant, so both land on exactly what the app draws.
 */

import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../src/data/milkyWay/milkyWayGalaxyParams';

export const DEFAULT_GALAXY_PARAMS: GalaxyParams = MILKY_WAY_GALAXY_PARAMS;
