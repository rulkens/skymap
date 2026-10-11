/**
 * StructureMarkersPassSpec — what the two structure-marker passes (cosmic and
 * Milky Way scale) vary on: pass name, which scale's visibility bands gate it,
 * the renderer it drives, and the planner whose list it reads.
 */

import type { StructureMarkerRenderer } from '../../../@types/rendering/StructureMarkerRenderer';
import type { StructureScale } from '../../../@types/data/structure/StructureScale';
import type { FrameContentPlanner } from '../../../@types/engine/frame/FrameContentPlanner';
import type { StructureMarkerDescriptor } from '../../../@types/rendering/StructureMarkerDescriptor';

export type StructureMarkersPassSpec = {
  readonly name: string;
  readonly scale: StructureScale;
  readonly renderer: StructureMarkerRenderer;
  /** A read key only: results are filed by planner name, so a fresh
   * `structureMarkersPlanner(runtime)` reads what `createLayers` registered. */
  readonly planner: FrameContentPlanner<readonly StructureMarkerDescriptor[]>;
};
