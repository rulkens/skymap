import type { Label2DProducer } from '../subsystems/Label2DProducer';
import type { Label3DProducer } from '../subsystems/Label3DProducer';

/** A Layer's `labels` split by slab: screen-space (NEAR0/COSMO directors) vs
 * world-anchored (`state.label3DProducers`). Either half may be absent. */
export type LayerLabels = {
  readonly screen?: readonly Label2DProducer[];
  readonly world?: readonly Label3DProducer[];
};
