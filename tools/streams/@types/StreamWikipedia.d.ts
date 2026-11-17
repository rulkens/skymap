/** A stream's English Wikipedia article: its title (the card's link) and lead-paragraph extract. */
export type StreamWikipedia = {
  readonly title: string;
  /** Empty when the summary has none; the meta's description is then null. */
  readonly extract: string;
};
