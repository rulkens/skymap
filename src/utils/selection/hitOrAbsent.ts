import type { FocusResolution } from '../../@types/engine/selection/FocusResolution';
import type { SelectionRefBase } from '../../@types/engine/selection/SelectionRefBase';

/** A row whose ids decode without loaded data answers only hit or absent. */
export function hitOrAbsent<Ref extends SelectionRefBase>(ref: Ref | null): FocusResolution<Ref> {
  return ref === null ? { kind: 'absent' } : { kind: 'hit', ref };
}
