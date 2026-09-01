/**
 * SCENE_ANCHOR_POINT_BODIES — every `AnchorPointBody` slab-candidacy
 * (`visibleSlabBodies`) and capacity accounting (`BODY_SLAB_CAPACITY`) walk.
 * Mirrors `SCENE_PLANETS`'s shape so a second anchor (e.g. M87*) is a data
 * append here, not a second call-site edit.
 */

import { SGR_A_STAR } from './sceneSgrAStar';
import type { AnchorPointBody } from '../../@types/scene/AnchorPointBody';

export const SCENE_ANCHOR_POINT_BODIES: readonly AnchorPointBody[] = [SGR_A_STAR];
