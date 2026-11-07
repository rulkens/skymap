/** One processed ornament before packing: ink and fill planes, padded, w×h px. */
export type OrnamentSprite = {
  readonly ink: Uint8Array;
  readonly fill: Uint8Array;
  readonly w: number;
  readonly h: number;
};
