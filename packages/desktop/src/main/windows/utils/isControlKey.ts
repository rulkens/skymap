import type { Input } from 'electron';

/** Whether a key press on the sky is CONTROL_SHORTCUT: Cmd+, on macOS, Ctrl+, elsewhere. */
export function isControlKey(input: Input, platform: NodeJS.Platform): boolean {
  if (input.type !== 'keyDown' || input.key !== ',' || input.alt || input.shift) return false;
  return platform === 'darwin' ? input.meta && !input.control : input.control && !input.meta;
}
