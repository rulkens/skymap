/**
 * What one driver step tells its caller: whether to cut this frame, whether to hold the wake,
 * and whether the cut's content is still arriving (a fetch out, or a landing still fading in).
 */
export type OctreeDriverStep = {
  readonly recut: boolean;
  readonly awake: boolean;
  readonly settling: boolean;
  readonly residencyChanged: boolean;
};
