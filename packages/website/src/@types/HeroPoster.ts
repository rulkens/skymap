/** The hero poster as responsive WebP candidates; the same srcset feeds the `<img>` and the head preload, so the browser fetches it once. */
export type HeroPoster = {
  src: string;
  srcset: string;
  sizes: string;
  width: number;
  height: number;
};
