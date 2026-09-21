import type { LayerScreenLabel } from './LayerScreenLabel';
import type { Label3DProducer } from '../subsystems/Label3DProducer';

/** A `screen` producer registers on the director of the slab it names — COSMO's
 * near plane is fixed at 0.01 Mpc, so anchors at parsec distances must name
 * NEAR0 or they are GPU-clipped and never draw. `world` is
 * `state.label3DProducers`. Either half may be absent. */
export type LayerLabels = {
  readonly screen?: readonly LayerScreenLabel[];
  readonly world?: readonly Label3DProducer[];
};
