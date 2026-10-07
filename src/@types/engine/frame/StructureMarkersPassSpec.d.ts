/**
 * StructureMarkersPassSpec — what the two structure-marker passes (cosmo and
 * NEAR0 slab) vary on: pass name, which slab's visibility bands gate it, and
 * which renderer handle it drives.
 */

import type { StructureMarkerRenderer } from '../../rendering/StructureMarkerRenderer';
import type { PassState } from './PassState';

export type StructureMarkersPassSpec = {
  readonly name: string;
  readonly slab: 'cosmo' | 'near0';
  rendererOf(state: PassState): StructureMarkerRenderer | null;
};
