/**
 * How a picture fills its box: `drawnWidth` is the CSS width the image is scaled to (wider than the
 * box under `object-fit: cover` when the aspects differ), `neededWidth` that times the screen's
 * pixel ratio, `croppedShare` the part of the image `cover` cuts away (0 to 1), and `stretch` how
 * far `fill` distorts it (box aspect over image aspect, 1 when true to shape).
 */
export type PictureFit = {
  drawnWidth: number;
  neededWidth: number;
  croppedShare: number;
  stretch: number;
};
