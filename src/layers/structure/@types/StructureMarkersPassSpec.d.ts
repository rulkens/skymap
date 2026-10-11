/**
 * StructureMarkersPassSpec — what the two structure-marker passes (cosmic and
 * Milky Way scale) vary on: pass name, which scale's visibility bands gate it, and
 * which renderer handle it drives.
 */

import type { StructureMarkerRenderer } from '../../../@types/rendering/StructureMarkerRenderer';
import type { StructureScale } from '../../../@types/data/structure/StructureScale';
import type { PassState } from '../../../@types/engine/frame/PassState';

export type StructureMarkersPassSpec = {
  readonly name: string;
  readonly scale: StructureScale;
  rendererOf(state: PassState): StructureMarkerRenderer | null;
};
