/**
 * Frame equality by what it names, not by object identity — the one check
 * that replaces the four hand-rolled per-site equalities this table collapses.
 */
import type { PoseFrame } from '../../../../@types/camera/PoseFrame';
import { frameKey } from './frameKey';

export function sameFrame(a: PoseFrame, b: PoseFrame): boolean {
  return frameKey(a) === frameKey(b);
}
