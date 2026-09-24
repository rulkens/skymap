/**
 * The blackHoles Layer's whole runtime: the lens renderer and the far-field
 * marker's glint renderer. Non-null — `create` builds both before returning,
 * so the passes read them without a null check.
 */

import type { BlackHoleLensingRenderer } from './BlackHoleLensingRenderer';
import type { BodyGlintRenderer } from '../../../@types/rendering/BodyGlintRenderer';

export type BlackHolesRuntime = {
  readonly lensRenderer: BlackHoleLensingRenderer;
  readonly markerRenderer: BodyGlintRenderer;
};
