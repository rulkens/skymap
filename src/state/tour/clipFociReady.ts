/**
 * clipFociReady — does every id in a clip resolve to a hit right now? The tour
 * saga polls it before calling `resolveClipFoci`, which throws on a miss. It
 * mirrors that walk rather than sharing a collector: the rewrite needs each
 * node's shape, and this check short-circuits on the first miss.
 */

import type { ClipData } from '../../@types/animation/ClipData';
import type { Effect } from '../../@types/animation/Effect';
import type { SelectionResolver } from '../../@types/engine/selection/SelectionResolver';

export function clipFociReady(data: ClipData, resolve: SelectionResolver): boolean {
  return data.timeline.every((e) => walkEffect(e, resolve));
}

function walkEffect(effect: Effect, resolve: SelectionResolver): boolean {
  switch (effect.kind) {
    case 'seq':
      return effect.children.every((c) => walkEffect(c, resolve));
    case 'all':
      return effect.children.every((c) => walkEffect(c, resolve));
    case 'fork':
      return walkEffect(effect.child, resolve);

    case 'moveTargetId':
    case 'dollyToId':
    case 'lookAtId':
    case 'strafeId':
    case 'spinToId':
      return resolve.resolveFocusId(effect.id).kind === 'hit';
    case 'focusId':
      // A null id is a focus-clear cue and needs no data.
      if (effect.id === null) return true;
      return resolve.resolveFocusId(effect.id).kind === 'hit';

    case 'flyPath':
      return effect.waypoints.every(
        (w) => !('id' in w) || resolve.resolveFocusId(w.id).kind === 'hit',
      );

    default:
      return true;
  }
}
