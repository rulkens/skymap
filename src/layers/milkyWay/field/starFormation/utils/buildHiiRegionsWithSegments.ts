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
 * concatenation boundary between each of its three tiers (shell/cluster
 * sprites, the DIG veil, the young-stars chain) as a `HiiSegment` —
 * consumed by the timing HUD for per-tier GPU cost rows
 * (`createGalaxyModel.ts`'s `hiiSegments`, `timing/timingSlots.ts`), and by
 * this file's own test suite / the extras path (`hiiMixtureOf`, `ismMap`
 * always null there so DIG is always empty regardless) as the CPU
 * ground-truth reference. A THIN wrapper over
 * `buildHiiShellsAndYoungWithSegments` since Task 8 moved the CENTRAL
 * galaxy's own DIG placement GPU-side (`placeDigVeil.wesl` +
 * `computeDigVeilBudget.ts`, wired through `createGalaxyModel.ts` — that
 * path no longer calls this function at all). Boundaries are `components`
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
