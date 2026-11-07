import type { Input } from 'electron';

/** Whether a key press on the sky is fullScreenAccelerator's key; read off the sky, since Windows hangs the menu elsewhere. */
export function isFullScreenKey(input: Input, platform: NodeJS.Platform): boolean {
  if (input.type !== 'keyDown') return false;
  if (platform === 'darwin') return input.control && input.meta && input.key.toLowerCase() === 'f';
  return input.key === 'F11';
}
