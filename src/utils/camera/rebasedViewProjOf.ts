import type { SlabView } from '../../@types/engine/frame/SlabView';
import { narrowMat4 } from '../math/narrowMat4';
import { rebaseViewProj } from './rebaseViewProj';

/**
 * The view's view-projection for positions packed relative to its own eye.
 * Rebased from the slab's f64 `vp`, never the already-narrowed `view.vp`, so
 * the eye translation cancels before precision is lost.
 */
export function rebasedViewProjOf(view: SlabView): Float32Array {
  return narrowMat4(rebaseViewProj(view.slab.vp, view.camPos));
}
