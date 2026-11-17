import type { LabelSource } from './LabelSource';
import type { LayerWorldLabel } from './LayerWorldLabel';
import type { OrbitTrailGroup } from './OrbitTrailGroup';

/** A `screenLabels` source registers on the director of the slab it names —
 * COSMO hides labels nearer than 10 kpc (`LABEL_DIRECTORS`' `nearHideMpc`), so anchors at
 * parsec distances must name NEAR0 or they never draw. `worldLabels` is
 * `state.label3DProducers`. Every half may be absent. */
export type LayerGuides = {
  readonly screenLabels?: readonly LabelSource<unknown>[];
  readonly worldLabels?: readonly LayerWorldLabel[];
  /** Static conics the orbit-trails pass propagates per frame, faded by the group's `show`
   * entry. Both `id` and `focusId` must resolve in the body-state snapshot, so a row here
   * must also be an `ORBITAL_ELEMENTS` row (`deriveBodyStates`' source); `orbitTrailsPass`
   * asserts both non-null. */
  readonly orbitTrails?: OrbitTrailGroup;
};
