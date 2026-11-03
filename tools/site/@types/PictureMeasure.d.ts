/**
 * One `<img>` or `<video>` inside a page's `<main>` as the browser drew it: the file it chose
 * (`currentSrc`), its box in CSS pixels from the top of the page (laid out, before transforms),
 * the intrinsic size of what it
 * decoded (0 when nothing has loaded) and its `object-fit`. `alt` is `null` when the attribute is
 * missing; `shown` is false for an element with no box at this width.
 */
export type PictureMeasure = {
  index: number;
  kind: 'img' | 'video';
  src: string;
  box: { x: number; y: number; width: number; height: number };
  naturalWidth: number;
  naturalHeight: number;
  objectFit: string;
  alt: string | null;
  shown: boolean;
};
