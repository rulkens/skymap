/** What a `<picture>` needs for one shot: both srcsets, a fallback file, the intrinsic size that reserves its box, and its largest file for a view of the picture alone. */
export type ShotSources = {
  avif: string;
  webp: string;
  fallback: string;
  full: string;
  width: number;
  height: number;
};
