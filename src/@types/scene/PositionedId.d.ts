/** PositionedId — anything `deriveBodyStates` positions: bodies and places. */

import type { SceneBodyId } from './SceneBodyId';
import type { PlaceId } from './PlaceId';

export type PositionedId = SceneBodyId | PlaceId;
