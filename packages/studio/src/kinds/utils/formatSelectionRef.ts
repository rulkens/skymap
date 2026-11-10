/** A resolved focus target as a row value: its id when it has one (`galaxy-cluster-virgo`), else its type; null is `none`. */
import type { SelectionRefBase } from '../../../../../src/@types/engine/selection/SelectionRefBase';

export function formatSelectionRef(ref: SelectionRefBase | null): string {
  return ref === null ? 'none' : String(ref['id'] ?? ref.type);
}
