/** The effect an `EffectPath` addresses in a clip, or null when the path names nothing. */
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { Effect } from '../../../../../src/@types/animation/Effect';
import type { EffectPath } from '../../../../../src/@types/animation/EffectPath';

export function effectAt(data: ClipData, path: EffectPath): Effect | null {
  let siblings: readonly Effect[] = data.timeline;
  let effect: Effect | null = null;
  for (const index of path) {
    effect = siblings[index] ?? null;
    if (effect === null) return null;
    // A fork's single child is index 0, so one path shape walks every structural node.
    siblings =
      effect.kind === 'seq' || effect.kind === 'all'
        ? effect.children
        : effect.kind === 'fork'
          ? [effect.child]
          : [];
  }
  return effect;
}
