import type { SelectionRowBase } from '../../@types/engine/selection/SelectionRowBase';

/**
 * Narrows a base-typed ref, row or target to the arm of one kind. The caller names the arm;
 * `type` is the only evidence, so the arm type must be the one that kind's Layer declares.
 */
export function isKind<Arm extends SelectionRowBase>(
  value: SelectionRowBase | null | undefined,
  type: Arm['type'],
): value is Arm {
  return value != null && value.type === type;
}
