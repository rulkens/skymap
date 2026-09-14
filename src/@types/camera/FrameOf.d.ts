import type { BodyId } from '../data/body/BodyId';

/**
 * Per-kind spelling of the `frame` tag: the world arm is the bare string,
 * the body arm carries the engaged body id. `PoseFrame` and
 * `FramedCameraPose` index this table rather than restating the union.
 */
export type FrameOf = {
  readonly absolute: 'absolute';
  readonly body: { readonly body: BodyId };
};
