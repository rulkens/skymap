import type { SceneBody } from '../../@types/scene/SceneBody';
import type { MeshBody } from '../../@types/scene/MeshBody';

/** isMeshBody — the ONE home for the `'meshKey' in body` discriminant (see
 *  `MeshBody.boundingRadiusM` for why the arms must stay distinguishable). */
export function isMeshBody(body: SceneBody): body is MeshBody {
  return 'meshKey' in body;
}
