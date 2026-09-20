/**
 * GalaxyFieldModel — the analytic field's derived half: every value the shell,
 * the stages and the probe read off one mixture input. Each node recomputes
 * exactly when its own declared key moves, so none of them has (or needs) an
 * invalidation site.
 */
import type { Derived } from '../gpu/Derived';
import type { DigVeilBudget } from './DigVeilBudget';
import type { PlaceDustBudget } from './PlaceDustBudget';
import type { DustHeaderLanes } from './DustHeaderLanes';
import type { FieldSliceCounts } from './FieldSliceCounts';
import type { GalaxyFieldMixtureResult } from './GalaxyFieldMixtureResult';
import type { HiiSegment } from './HiiSegment';

export type GalaxyFieldModel = {
  readonly centralField: Derived<GalaxyFieldMixtureResult>;
  readonly dustHeaderLanes: Derived<DustHeaderLanes>;
  readonly dustBudget: Derived<PlaceDustBudget | null>;
  readonly digBudget: Derived<DigVeilBudget | null>;
  readonly fieldPack: Derived<{ packed: Float32Array; counts: FieldSliceCounts }>;
  readonly hiiPack: Derived<{ packed: Float32Array; segments: readonly HiiSegment[] }>;
};
