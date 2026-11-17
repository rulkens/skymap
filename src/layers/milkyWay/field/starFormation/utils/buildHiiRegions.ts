import type { GalaxyFieldComponent } from '../../mixture/@types/GalaxyFieldComponent';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../mixture/@types/GalaxyFieldTuning';
import type { GalaxyIsmMap } from '../../../../../@types/galaxy/GalaxyIsmMap';
import type { GalaxyStarFormationParams } from '../@types/GalaxyStarFormationParams';
import { buildHiiRegionsWithSegments } from './buildHiiRegionsWithSegments';

/**
 * buildHiiRegions — the flat-array view of `buildHiiRegionsWithSegments`, for
 * every caller that only wants the mixture (every test in this file's own
 * suite, and any future consumer that doesn't care about the timing HUD).
 */
export function buildHiiRegions(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
  starFormation: GalaxyStarFormationParams,
  seed: number,
  ismMap: GalaxyIsmMap | null,
): readonly GalaxyFieldComponent[] {
  return buildHiiRegionsWithSegments(geometry, tuning, starFormation, seed, ismMap).components;
}
