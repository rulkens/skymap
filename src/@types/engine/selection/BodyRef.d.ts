import type { SceneBodyId } from '../../scene/SceneBodyId';

/** A scene body's ref; core because the camera's body arm, home pose and URL read it. */
export type BodyRef = { readonly type: 'body'; readonly id: SceneBodyId };
