import type { QuitGate } from './@types/QuitGate';

/** Closed until `allowQuit`: a kiosk keyboard's Alt+F4 or Cmd+W must not end the show (spec §6). */
export function createQuitGate(): QuitGate {
  let quitting = false;
  return { allowQuit: () => void (quitting = true), mayClose: () => quitting };
}
