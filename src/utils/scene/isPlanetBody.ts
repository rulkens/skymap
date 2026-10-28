import type { PlanetBody } from '../../@types/scene/PlanetBody';
import type { SceneBody } from '../../@types/scene/SceneBody';

/** Earth has no albedo, a star no albedo, a mesh no surface: only a planet or moon has both. */
export function isPlanetBody(body: SceneBody): body is PlanetBody {
  return 'albedo' in body && 'surface' in body;
}
