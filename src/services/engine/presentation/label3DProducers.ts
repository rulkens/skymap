import type { Label3DProducer } from '../../../@types/engine/subsystems/Label3DProducer';
import { produceZoneOfAvoidanceLettering } from './produceZoneOfAvoidanceLettering';

export const LABEL_3D_PRODUCERS: readonly Label3DProducer[] = [
  { id: 'zoneOfAvoidanceLettering', produceLabels3D: produceZoneOfAvoidanceLettering },
];
