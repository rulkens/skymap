import type { LumaStats } from './LumaStats';

/**
 * One picture of a page judged at one width, as `npm run site:judge` reports it. `shotId` and `link`
 * come from the shot manifest (`null` for a video); `sourceWidth` is the file the browser chose,
 * `widestFile` the manifest's widest, so an upscale reads as a `sizes` fault or as a shot too
 * narrow. `hiddenNow` marks a slide waiting under another when its crop was taken, so its crop and
 * `luma` come from its file framed to its box. Both are set with the crop (`luma` is `null` before). `flags` are the problems, each a
 * sentence starting with its upper-case name.
 */
export type PictureJudgement = {
  index: number;
  kind: 'img' | 'video';
  shotId: string | null;
  file: string;
  link: string | null;
  section: string;
  box: { width: number; height: number };
  sourceWidth: number | null;
  neededWidth: number | null;
  widestFile: number | null;
  croppedShare: number | null;
  transparent: boolean;
  hiddenNow: boolean;
  alt: string | null;
  luma: LumaStats | null;
  flags: string[];
};
