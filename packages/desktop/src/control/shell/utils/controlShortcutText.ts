import { CONTROL_SHORTCUT } from '../../../data/controlShortcut';
import { shortcutLabel } from './shortcutLabel';

/** The control-window shortcut as this computer's keyboard spells it; page-side only (reads navigator). */
export function controlShortcutText(): string {
  return shortcutLabel(CONTROL_SHORTCUT, navigator.userAgent.includes('Mac'));
}
