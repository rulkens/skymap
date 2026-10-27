import type { FocusMoveStyle } from '../../@types/camera/FocusMoveStyle';

// A Record, so a new style fails to compile here until it is accepted.
const STYLES: Readonly<Record<FocusMoveStyle, true>> = { eased: true, geodesic: true };

/** The stored style, or null (which seeds the default) for a hand-edited or retired value. */
export function parseFocusMoveStyle(raw: string): FocusMoveStyle | null {
  return Object.hasOwn(STYLES, raw) ? (raw as FocusMoveStyle) : null;
}
