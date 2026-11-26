/** Every arm but the sky treats a bodiless focus as no focus: both name no body. */

import type { ArmFocus } from '../../../@types/camera/arms/ArmFocus';
import type { PositionedId } from '../../../@types/scene/PositionedId';

export function focusBodyIdOf(focus: ArmFocus): PositionedId | null {
  return focus.kind === 'body' ? focus.id : null;
}
