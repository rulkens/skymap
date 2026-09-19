import type { Label3DProducer } from '../../../@types/engine/subsystems/Label3DProducer';
import { produceZoneOfAvoidanceLettering } from './produceZoneOfAvoidanceLettering';

// Core's half of `state.label3DProducers`; `createLayers` composes each
// Layer's `worldLabels` after these. A future PR moves this row onto the
// `zoneOfAvoidance` Layer itself.
export const LABEL_3D_PRODUCERS: readonly Label3DProducer[] = [
  { id: 'zoneOfAvoidanceLettering', produceLabels3D: produceZoneOfAvoidanceLettering },
];
