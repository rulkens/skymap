/** The path of every effect in the draft, in outline order: group children and a fork's child, not waypoints. */
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { Effect } from '../../../../../src/@types/animation/Effect';
import type { EffectPath } from '../../../../../src/@types/animation/EffectPath';

export function effectPaths(draft: ClipData): EffectPath[] {
  const walk = (effects: readonly Effect[], parent: EffectPath): EffectPath[] =>
    effects.flatMap((effect, index) => {
      const path = [...parent, index];
      const children =
        effect.kind === 'seq' || effect.kind === 'all'
          ? effect.children
          : effect.kind === 'fork'
            ? [effect.child]
            : [];
      return [path, ...walk(children, path)];
    });
  return walk(draft.timeline, []);
}
