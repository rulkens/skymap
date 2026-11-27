import type { Vec2 } from '../../math/Vec2';
import type { Vec4 } from '../../math/Vec4';

/** What `lib/horizonLookup.wesl`'s `horizonVisibility` reads at one ground point: the horizon
 *  atlas, the tile's post rect (`horizonPostRect`) and the point's uv inside that tile, in the
 *  surface-tile patch's convention (u east, v south from the tile's north edge). */
export type TerrainHorizonSample = {
  readonly atlas: GPUTextureView;
  readonly rect: Readonly<Vec4>;
  readonly uv: Readonly<Vec2>;
};
