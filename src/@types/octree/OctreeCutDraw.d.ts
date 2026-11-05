/** What a draw binds to read one cut stream: its bind group and the indirect record. */
export type OctreeCutDraw = {
  readonly bindGroup: GPUBindGroup;
  readonly indirect: GPUBuffer;
  readonly indirectOffset: number;
};
