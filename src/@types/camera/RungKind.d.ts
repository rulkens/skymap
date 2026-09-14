/**
 * The two camera-pose rungs: the world arm ('absolute') and a body-fixed arm
 * ('body') (spec §2.1). One kind per storage representation — `FrameOf` and
 * `PoseOf` key off this, so a third rung starts here.
 */
export type RungKind = 'absolute' | 'body';
