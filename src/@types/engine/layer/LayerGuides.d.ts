import type { LayerScreenLabel } from './LayerScreenLabel';
import type { Label3DProducer } from '../subsystems/Label3DProducer';
import type { OrbitalElements } from '../../scene/OrbitalElements';

/** A `screenLabels` producer registers on the director of the slab it names —
 * COSMO's near plane is fixed at 0.01 Mpc, so anchors at parsec distances must
 * name NEAR0 or they are GPU-clipped and never draw. `worldLabels` is
 * `state.label3DProducers`. Every half may be absent. */
export type LayerGuides = {
  readonly screenLabels?: readonly LayerScreenLabel[];
  readonly worldLabels?: readonly Label3DProducer[];
  /** Static conics the orbit-trails pass propagates per frame; `focusId` must be a
   * body-state anchor. */
  readonly orbitTrails?: readonly OrbitalElements[];
};
