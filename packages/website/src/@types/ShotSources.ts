/** What a `<picture>` needs for one shot: both srcsets, a fallback file and the intrinsic size that reserves its box. */
export type ShotSources = {
  avif: string;
  webp: string;
  fallback: string;
  width: number;
  height: number;
};
