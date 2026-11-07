import type { IpcMainInvokeEvent, WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import type { ControlIpcHandlers } from '../../../src/main/lifecycle/@types/ControlIpcHandlers';
import { registerControlIpc } from '../../../src/main/lifecycle/registerControlIpc';

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

function register(isAllowed: Parameters<typeof registerControlIpc>[1]) {
  const listeners = new Map<string, Listener>();
  const handle = (channel: string, listener: Listener) => void listeners.set(channel, listener);
  const handlers = Object.fromEntries(
    [
      'getState',
      'saveSetup',
      'updateNow',
      'restartSky',
      'showTestGrid',
      'rotateCode',
      'hide',
      'quit',
    ].map((request) => [request, vi.fn(() => request)]),
  ) as unknown as ControlIpcHandlers;
  registerControlIpc({ handle } as never, isAllowed, handlers);
  return { listeners, handlers };
}

const control = {} as WebContents;
const stranger = {} as WebContents;
const from = (sender: WebContents) => ({ sender }) as IpcMainInvokeEvent;

describe('registerControlIpc', () => {
  it('refuses a foreign sender on every channel, without running a handler', () => {
    const { listeners, handlers } = register((sender) => sender === control);
    expect(listeners.size).toBe(Object.keys(handlers).length);
    for (const listener of listeners.values()) {
      expect(() => listener(from(stranger))).toThrow(/refused/);
    }
    for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled();
  });

  it('passes an allowed sender through with its arguments', () => {
    const { listeners, handlers } = register((sender) => sender === control);
    expect(listeners.get('control:saveSetup')?.(from(control), { mode: 'dome' })).toBe('saveSetup');
    expect(handlers.saveSetup).toHaveBeenCalledWith({ mode: 'dome' });
  });

  it('asks per request, so a window can be allowed one channel only', () => {
    const { listeners } = register(
      (sender, request) => sender === control || request === 'getState',
    );
    expect(listeners.get('control:getState')?.(from(stranger))).toBe('getState');
    expect(() => listeners.get('control:quit')?.(from(stranger))).toThrow(/refused/);
  });
});
