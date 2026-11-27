import type { SceneBodyId } from '../../scene/SceneBodyId';
import type { Vec3 } from '../../math/Vec3';
import type { TerrainHorizonSample } from './TerrainHorizonSample';

/** The baked terrain horizon under a body-fixed direction; null where none is resident, so the
 *  reader draws fully lit. */
export type TerrainHorizonLookup = (
  bodyId: SceneBodyId,
  dirBodyFixed: Readonly<Vec3>,
) => TerrainHorizonSample | null;
