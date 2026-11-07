/** A stream's published stellar mass and the citation shown beside it on the card. */
export type StreamStellarMass = {
  readonly massMsun: number;
  readonly ref: string;
  /** Converted by us from a published luminosity at a cited mass-to-light ratio; the card prefixes "≈". */
  readonly derived: boolean;
};
