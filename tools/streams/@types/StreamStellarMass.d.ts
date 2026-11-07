/** A stream's published stellar mass and the citation shown beside it on the card. */
export type StreamStellarMass = {
  readonly massMsun: number;
  readonly ref: string;
  /** Measured over only part of the stream, so the whole holds more; the card prefixes "≥". */
  readonly partial: boolean;
};
