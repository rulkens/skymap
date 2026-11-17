/**
 * How shown a selection kind is at one view: its selecting show entry's handed value times its
 * band there, the value that entry's passes draw at (the brightest item, for a per-item entry).
 * A kind no entry selects has no switch to hide it, so it is fully shown.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { SelectionRefBase } from '../../../@types/engine/selection/SelectionRefBase';
import { selectingEntryOf } from '../../../utils/visibility/selectingEntryOf';
import { visibilityAddressOf } from '../../../utils/visibility/visibilityAddressOf';
import { resolveViewFadeValue } from './resolveViewFadeValue';

export function selectionKindShown(
  state: Pick<EngineState, 'subsystems' | 'visibilityEntries'>,
  view: FrameView,
  kind: SelectionRefBase['type'],
): number {
  const entry = selectingEntryOf(state.visibilityEntries, kind);
  if (entry === undefined) return 1;
  const value: number | Readonly<Record<string, number>> = resolveViewFadeValue(
    state,
    view,
    visibilityAddressOf(entry),
  );
  return typeof value === 'number' ? value : Math.max(0, ...Object.values(value));
}
