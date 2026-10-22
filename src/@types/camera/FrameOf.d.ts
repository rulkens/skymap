import type { BodySourceId } from '../data/body/BodySourceId';

/** Per-`RungKind` `frame` tag shape; `PoseFrame` indexes this and must spell what it spelled before. */
export type FrameOf = {
  readonly absolute: 'absolute';
  readonly body: { readonly body: BodySourceId };
  readonly site: { readonly site: BodySourceId };
};
