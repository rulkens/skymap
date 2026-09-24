/**
 * The blackHoles Layer's whole runtime: the lens renderer and the far-field
 * marker's glint renderer. Non-null — `create` builds both before returning,
 * so the passes read them without a null check.
 */

import type { SgrAStarLensingRenderer } from './SgrAStarLensingRenderer';
import type { BodyGlintRenderer } from '../../../@types/rendering/BodyGlintRenderer';

export type BlackHolesRuntime = {
  readonly lensRenderer: SgrAStarLensingRenderer;
  readonly markerRenderer: BodyGlintRenderer;
};
