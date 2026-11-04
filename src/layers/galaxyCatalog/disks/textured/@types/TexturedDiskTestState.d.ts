/**
 * Test/inspection seam — `__testGetState` lets the planner's
 * bookkeeping be asserted from tests.
 */
export type TexturedDiskTestState = {
  readonly bitmapReadyTime: ReadonlyMap<string, number>;
};
