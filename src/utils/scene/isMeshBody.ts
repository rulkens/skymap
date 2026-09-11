import type { SceneBody } from '../../@types/scene/SceneBody';
import type { MeshBody } from '../../@types/scene/MeshBody';

/** isMeshBody — the ONE home for the `'meshKey' in body` discriminant. A
 *  `MeshBody` is structurally assignable to `PlanetBody` in some field subsets,
 *  so `meshKey` is the only field that separates the arms; keeping the test in
 *  one place stops a second, subtly different copy from drifting in. */
export function isMeshBody(body: SceneBody): body is MeshBody {
  return 'meshKey' in body;
}
