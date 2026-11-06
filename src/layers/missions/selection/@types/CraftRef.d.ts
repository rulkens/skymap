import type { SceneBodyId } from '../../../../@types/scene/SceneBodyId';

/** A craft's ref: the seed `id` keying the static `SCENE_BODIES` table. */
export type CraftRef = { readonly type: 'craft'; readonly id: SceneBodyId };
