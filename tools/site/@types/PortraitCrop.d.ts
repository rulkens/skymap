/** A portrait still as sharp operations: the source region to extract, the height it scales to at the output width, and the black rows to add above and below. */
export type PortraitCrop = {
  left: number;
  width: number;
  height: number;
  scaledHeight: number;
  padTop: number;
  padBottom: number;
};
