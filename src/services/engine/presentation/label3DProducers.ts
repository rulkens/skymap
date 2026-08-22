import type { Label3DProducer } from '../../../@types/engine/subsystems/Label3DProducer';
import { produceZoneOfAvoidanceLettering } from './produceZoneOfAvoidanceLettering';
// THROWAWAY (vrSpike): `produceVrLabels` is inert outside an active VR
// session (see its own no-op guard) — safe to always include here. Delete
// with the spike.
import { produceVrLabels } from './produceVrLabels';

export const LABEL_3D_PRODUCERS: readonly Label3DProducer[] = [
  { id: 'zoneOfAvoidanceLettering', produceLabels3D: produceZoneOfAvoidanceLettering },
  { id: 'vrLabels', produceLabels3D: produceVrLabels },
];
