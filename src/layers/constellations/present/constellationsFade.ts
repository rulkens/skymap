/**
 * constellationsFade — full per-frame opacity: `constellationsBand` times the value core
 * hands (the lines' show value to the pass, the names' label value to the producer).
 * `enabled()` wants the band alone (see that file).
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import { constellationsBand } from './constellationsBand';

export function constellationsFade(ctx: Pick<FrameView, 'drawCamPos'>, fade: number): number {
  return constellationsBand(ctx) * fade;
}
