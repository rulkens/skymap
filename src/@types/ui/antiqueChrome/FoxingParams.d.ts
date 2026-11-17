/**
 * FoxingParams — a sheet of foxing, in CSS px: `spots` rust spots on a `width` ×
 * `height` sheet, each a dark core up to `core` across in a halo up to `halo`, plus
 * one faint tide-line (`tideAlpha`) where damp once dried. Colours are the paper's
 * `tone`. Read by `foxingSvg`.
 */
export type FoxingParams = {
  readonly width: number;
  readonly height: number;
  readonly spots: number;
  readonly core: number;
  readonly halo: number;
  readonly coreAlpha: number;
  readonly haloAlpha: number;
  readonly tideAlpha: number;
  readonly tone: string;
};
