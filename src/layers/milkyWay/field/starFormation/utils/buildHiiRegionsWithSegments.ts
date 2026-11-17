import { buildHiiShellsAndYoungWithSegments } from './buildHiiShellsAndYoungWithSegments';
import type { GalaxyFieldComponent } from '../../mixture/@types/GalaxyFieldComponent';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../mixture/@types/GalaxyFieldTuning';
import type { GalaxyIsmMap } from '../../../../../@types/galaxy/GalaxyIsmMap';
import type { GalaxyStarFormationParams } from '../@types/GalaxyStarFormationParams';
import type { HiiSegment } from '../@types/HiiSegment';
import { buildDigVeil } from './buildDigVeil';

const EMPTY_HII_RESULT: {
  readonly components: readonly GalaxyFieldComponent[];
  readonly segments: readonly HiiSegment[];
} = { components: [], segments: [] };

/**
 * buildHiiRegionsWithSegments — `buildHiiRegions`' full computation, plus the
 * boundary between each of its three tiers (shell/cluster sprites, the DIG
 * veil, the young-stars chain) as a `HiiSegment`: the CPU ground truth for
 * this file's tests. Production reaches it only through `buildHiiRegions`
 * for extras (`ismMap` null, so DIG is empty); the central galaxy's DIG is
 * placed GPU-side (`placeDigVeil.wesl`, budgeted by `computeDigVeilBudget.ts`
 * in `subsystems/createGalaxyFieldModel.ts`). Boundaries are `components`
 * length checkpoints, never derived from a count formula, so they can't
 * drift from what actually landed in the array.
 */
export function buildHiiRegionsWithSegments(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
  starFormation: GalaxyStarFormationParams,
  seed: number,
  ismMap: GalaxyIsmMap | null,
): {
  readonly components: readonly GalaxyFieldComponent[];
  readonly segments: readonly HiiSegment[];
} {
  const base = buildHiiShellsAndYoungWithSegments(geometry, tuning, starFormation, seed);
  if (base.segments.length === 0) return EMPTY_HII_RESULT;

  const shellsSegment = base.segments.find((s) => s.label === 'hii:shells')!;
  const shellsEnd = shellsSegment.count;

  const digComponents = buildDigVeil(
    geometry,
    tuning,
    ismMap,
    base.shellFluxSum,
    base.recentEventCount,
    seed,
  );

  const out = [
    ...base.components.slice(0, shellsEnd),
    ...digComponents,
    ...base.components.slice(shellsEnd),
  ];
  const segments: readonly HiiSegment[] = [
    { label: 'hii:shells', first: 0, count: shellsEnd },
    { label: 'hii:dig', first: shellsEnd, count: digComponents.length },
    {
      label: 'hii:young',
      first: shellsEnd + digComponents.length,
      count: base.components.length - shellsEnd,
    },
  ];
  return { components: out, segments };
}
