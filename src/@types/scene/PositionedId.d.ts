/** PositionedId — anything `deriveBodyStates` positions: bodies, places and transient objects. */

import type { SceneBodyId } from './SceneBodyId';
import type { PlaceId } from './PlaceId';
import type { TransientBodyId } from './TransientBodyId';

export type PositionedId = SceneBodyId | PlaceId | TransientBodyId;
