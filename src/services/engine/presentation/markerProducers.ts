import type { MarkerProducer } from '../../../@types/engine/subsystems/MarkerProducer';
import { produceStructureMarkers } from './produceStructureMarkers';

export const MARKER_PRODUCERS: readonly MarkerProducer[] = [
  { id: 'structureMarkers', produceMarkers: produceStructureMarkers },
];
