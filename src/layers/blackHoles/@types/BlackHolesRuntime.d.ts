/**
 * The blackHoles Layer's whole runtime: the lens renderer, the far-field
 * marker's glint renderer and the pick code. Non-null — `create` builds them before returning,
 * so the passes read them without a null check.
 */

import type { BlackHoleLensingRenderer } from '../lensing/@types/BlackHoleLensingRenderer';
import type { BodyGlintRenderer } from '../../../@types/rendering/BodyGlintRenderer';

export type BlackHolesRuntime = {
  readonly lensRenderer: BlackHoleLensingRenderer;
  readonly markerRenderer: BodyGlintRenderer;
  /** The Layer's pick code; the marker stamp, caption and selection row all pack it. */
  readonly pickCode: number;
};
