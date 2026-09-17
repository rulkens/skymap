/**
 * TonemapSettings — the SDR tone curve and its input exposure. `HdrSettings`
 * knees the over-range energy on top of whatever this produces.
 */
import type { ToneMapCurve } from '../data/ToneMapCurve';

export type TonemapSettings = {
  exposure: number;
  curve: ToneMapCurve;
};
