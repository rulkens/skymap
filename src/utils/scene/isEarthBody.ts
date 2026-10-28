import type { EarthBody } from '../../@types/scene/EarthBody';
import type { SceneBody } from '../../@types/scene/SceneBody';

/** Earth shares its record shape with the planet-less `EarthBody`, so only its id tells it apart. */
export function isEarthBody(body: SceneBody): body is EarthBody {
  return body.id === 'earth';
}
