/**
 * GalaxyFieldModel — the analytic field's derived half: every value the shell,
 * the stages and the probe read off one mixture input. Each node recomputes
 * exactly when its own declared key moves, so none of them has (or needs) an
 * invalidation site.
 */
import type { Derived } from '../../../../@types/gpu/Derived';
import type { DigVeilBudget } from './ismMap/computeDigVeilBudget';
import type { PlaceDustBudget } from './ismMap/computePlaceDustBudget';
import type { DustHeaderLanes } from '../../../../@types/galaxy/DustHeaderLanes';
import type { FieldSliceCounts } from '../../../../@types/galaxy/FieldSliceCounts';
import type { GalaxyFieldMixtureResult } from '../../../../@types/galaxy/GalaxyFieldMixtureResult';
import type { HiiSegment } from '../../../../@types/galaxy/HiiSegment';

export type GalaxyFieldModel = {
  readonly centralField: Derived<GalaxyFieldMixtureResult>;
  readonly dustHeaderLanes: Derived<DustHeaderLanes>;
  readonly dustBudget: Derived<PlaceDustBudget | null>;
  readonly digBudget: Derived<DigVeilBudget | null>;
  readonly fieldPack: Derived<{ packed: Float32Array; counts: FieldSliceCounts }>;
  readonly hiiPack: Derived<{ packed: Float32Array; segments: readonly HiiSegment[] }>;
};
