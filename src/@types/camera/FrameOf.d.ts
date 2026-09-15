import type { BodyId } from '../data/body/BodyId';

/** Per-`RungKind` `frame` tag shape; `PoseFrame` indexes this and must spell what it spelled before. */
export type FrameOf = {
  readonly absolute: 'absolute';
  readonly body: { readonly body: BodyId };
  readonly site: { readonly site: BodyId };
};
