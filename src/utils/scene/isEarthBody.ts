import type { EarthBody } from '../../@types/scene/EarthBody';
import type { SceneBody } from '../../@types/scene/SceneBody';

/** `EarthBody` is a distinct record shape from the planets, but the type alone can't narrow a `SceneBody`; Earth is the one body with id 'earth'. */
export function isEarthBody(body: SceneBody): body is EarthBody {
  return body.id === 'earth';
}
