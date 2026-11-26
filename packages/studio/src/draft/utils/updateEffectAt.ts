/**
 * A copy of the clip with the effect at `path` replaced by `update(effect)`. Only the spine from the
 * root to the target is new; every other subtree keeps its identity, so undo snapshots share
 * structure and memoised selectors over untouched rows stay hit. A path that names nothing throws:
 * paths come from the draft itself, so a miss is a caller bug.
 */
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { Effect } from '../../../../../src/@types/animation/Effect';
import type { EffectPath } from '../../../../../src/@types/animation/EffectPath';

export function updateEffectAt(
  data: ClipData,
  path: EffectPath,
  update: (effect: Effect) => Effect,
): ClipData {
  const miss = () => new Error(`updateEffectAt: no effect at [${path.join(', ')}]`);
  const within = (siblings: readonly Effect[], depth: number): Effect[] => {
    const index = path[depth];
    const target = index === undefined ? undefined : siblings[index];
    if (target === undefined) throw miss();
    const next = depth === path.length - 1 ? update(target) : descend(target, depth + 1);
    return siblings.map((effect, i) => (i === index ? next : effect));
  };
  const descend = (effect: Effect, depth: number): Effect => {
    if (effect.kind === 'seq' || effect.kind === 'all') {
      return { ...effect, children: within(effect.children, depth) };
    }
    if (effect.kind === 'fork') return { ...effect, child: within([effect.child], depth)[0]! };
    throw miss();
  };
  return { ...data, timeline: within(data.timeline, 0) };
}
