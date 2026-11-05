export type PickCodeAllocator = {
  /** Same (layer, id) → same code. Throws past 62 codes. */
  codeOf(layer: string, pickSourceId: string): number;
  /** The code if that (layer, id) already asked, else null; never allocates. */
  codeIfAsked(layer: string, pickSourceId: string): number | null;
};
