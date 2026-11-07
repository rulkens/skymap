/** One processed ornament before packing: ink, fill, wash and accent planes, padded, w×h px. */
export type OrnamentSprite = {
  readonly ink: Uint8Array;
  readonly fill: Uint8Array;
  readonly wash: Uint8Array;
  readonly accent: Uint8Array;
  readonly w: number;
  readonly h: number;
};
