/** The six SoA lanes, in io.wesl's binding order (slots 3..8). */
export type SeededAgents = {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly phi: Float32Array;
  readonly theta: Float32Array;
  readonly weight: Float32Array;
};
