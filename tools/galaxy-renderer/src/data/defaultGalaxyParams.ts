/**
 * DEFAULT_GALAXY_PARAMS — the tool's boot generation preset.
 *
 * This tool exists to tune the app's Milky Way star cloud, so it boots
 * straight into the app's own Milky Way rather than a generic spiral: any
 * other boot state costs a manual gallery pick before a single measurement
 * or visual comparison is valid.
 *
 * Re-exported from `MILKY_WAY_GALAXY_PARAMS`
 * (`src/data/milkyWay/milkyWayGalaxyParams.ts`), NOT copied — that constant
 * is the single source of truth shared by the app's own generation and this
 * tool's reference gallery, so the tool's default render and the app's own
 * Milky Way can never quietly disagree.
 */

import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../src/data/milkyWay/milkyWayGalaxyParams';

export const DEFAULT_GALAXY_PARAMS: GalaxyParams = MILKY_WAY_GALAXY_PARAMS;
