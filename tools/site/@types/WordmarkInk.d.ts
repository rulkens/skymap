/** The colours of one wordmark file: the word's fill and the trail's three gradient stops, start to end. */
export type WordmarkInk = {
  word: string;
  fade: readonly [string, string, string];
};
