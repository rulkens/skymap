/**
 * splitVisibilityArgs — separate a `show()`/`hide()` layer list into the two
 * vocabularies it mixes: atomic `VisibilityLayerKey`s (aggregates like
 * `'labels'` expanded via `expandVisibilityLayers`) and `'family:scope'`
 * scoped entries.
 *
 * The split exists because the two halves take different paths at fire time:
 * atomic keys go through `VISIBILITY_ACTION_ROW` + the explicit fade sync
 * (honouring the cue's `over`), while scoped entries dispatch one targeted
 * settings action and let the reactive settings→fade bridge animate. Keeping
 * them in separate fields of the stored effect means neither consumer has to
 * re-parse a mixed list.
 *
 * The discriminator is the `':'` — no atomic key or aggregate contains one,
 * and every scoped entry does (the template-literal type guarantees it).
 */

import type { VisibilityLayerKey } from '../../@types/animation/VisibilityLayerKey';
import type { VisibilityLayerArg } from '../../@types/animation/VisibilityLayerArg';
import type { ScopedVisibilityArg } from '../../@types/animation/ScopedVisibilityArg';
import { expandVisibilityLayers } from './expandVisibilityLayers';

export function splitVisibilityArgs(args: readonly (VisibilityLayerArg | ScopedVisibilityArg)[]): {
  layers: VisibilityLayerKey[];
  scoped: ScopedVisibilityArg[];
} {
  const plain: VisibilityLayerArg[] = [];
  const scoped: ScopedVisibilityArg[] = [];
  for (const arg of args) {
    // ':' is the scoped discriminator — the casts are sound because the input
    // union's scoped arms all contain one and its plain arms never do.
    if (arg.includes(':')) scoped.push(arg as ScopedVisibilityArg);
    else plain.push(arg as VisibilityLayerArg);
  }
  return { layers: expandVisibilityLayers(plain), scoped };
}
