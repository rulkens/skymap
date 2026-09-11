/**
 * isPickableLabel — whether a label could take a click: it names a selectable
 * subject (`pickId`) and has opacity left. An invisible label is never
 * pickable — the fade is the affordance, so a label mid-fade-out stays
 * clickable exactly as long as it stays readable. The one predicate shared by
 * the cheap `hasPickableLabel` gate and `labelPickQuads`' emit loop, which
 * must agree: a gate that rejects a frame the emit would fill is a silently
 * dead pick.
 */

import type { Label2D } from '../../@types/rendering/Label2D';

export function isPickableLabel(label: Label2D): boolean {
  return label.pickId !== undefined && (label.fadeAlpha ?? 1) > 0;
}
