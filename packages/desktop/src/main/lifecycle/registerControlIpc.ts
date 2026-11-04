import type { IpcMain, WebContents } from 'electron';
import type { ControlIpcHandlers } from './@types/ControlIpcHandlers';
import { CONTROL_CHANNELS } from '../../data/controlChannels';

/**
 * Answers the control page's requests, each behind one sender check, so a handler added later
 * cannot forget it. A refused sender gets a rejection, never a fallback value.
 */
export function registerControlIpc(
  ipc: Pick<IpcMain, 'handle'>,
  isAllowed: (sender: WebContents, request: keyof ControlIpcHandlers) => boolean,
  handlers: ControlIpcHandlers,
): void {
  for (const request of Object.keys(handlers) as (keyof ControlIpcHandlers)[]) {
    ipc.handle(CONTROL_CHANNELS[request], (event, ...args: unknown[]) => {
      if (!isAllowed(event.sender, request)) throw new Error(`${request}: refused for this window`);
      return handlers[request](...args);
    });
  }
}
