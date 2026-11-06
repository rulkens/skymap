import type { SceneBodyId } from '../../../@types/scene/SceneBodyId';

/** An Earth scene's ref: the seed `id` keying the static `SCENE_BODIES` table. */
export type EarthSceneRef = { readonly type: 'earthScene'; readonly id: SceneBodyId };
