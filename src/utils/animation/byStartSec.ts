/**
 * byStartSec — the one order of a channel's writers: earliest start first. The
 * sort is stable, so equal starts keep push (tree) order, which puts a zero-length
 * child before the step it fires with; the compiled tracks and the seq-join rules
 * must agree on it, or a rule's named error turns into an anonymous one.
 */
import type { BaseSegment } from '../../@types/animation/compiledClip/BaseSegment';

export function byStartSec(a: Pick<BaseSegment, 'startSec'>, b: Pick<BaseSegment, 'startSec'>) {
  return a.startSec - b.startSec;
}
