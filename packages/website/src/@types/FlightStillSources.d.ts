/** One flight still in one shape: AVIF and WebP `srcset` strings, the `sizes` that matches how it covers the stage, and a plain fallback. */
export type FlightStillSources = {
  avif: string;
  webp: string;
  sizes: string;
  src: string;
  width: number;
  height: number;
};
