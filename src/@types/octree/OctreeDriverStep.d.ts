/** What one driver step tells its caller: whether to cut this frame and whether to hold the wake. */
export type OctreeDriverStep = {
  readonly recut: boolean;
  readonly awake: boolean;
  readonly residencyChanged: boolean;
};
