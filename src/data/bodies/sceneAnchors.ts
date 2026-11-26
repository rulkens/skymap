/**
 * SCENE_ANCHORS — roots of the focus graph: positions stated outright, not derived from
 * `OrbitalElements`. The composed Layers' `anchor` rows (the seeded stars), then the Galactic
 * Centre, a core place: an anchor need not be drawn, only positioned.
 */

import { APP_BODY_REGISTRY } from '../../compositions/appBodies';
import { GALACTIC_CENTRE_ANCHOR } from '../places/galacticCentre';
import type { AnchorBody } from '../../@types/scene/AnchorBody';

export const SCENE_ANCHORS: readonly AnchorBody[] = [
  ...APP_BODY_REGISTRY.flatMap(({ body, position }): AnchorBody[] =>
    position.kind === 'anchor' ? [{ id: body.id, positionMpc: position.positionMpc }] : [],
  ),
  // Last, so the star rows keep their order. It anchors the `galactic-centre` region rather than
  // falling into the neighbourhood's residual set, so its 8 kpc never reaches an extent.
  GALACTIC_CENTRE_ANCHOR,
];
