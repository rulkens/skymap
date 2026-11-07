import { describe, expect, it, vi } from 'vitest';
import type { ControlBridge } from '../../src/@types/ControlBridge';

const electron = vi.hoisted(() => ({
  exposed: null as ControlBridge | null,
  // IPC clones what it sends, as Electron does; a React event (functions, a DOM node) throws here.
  invoke: (...args: unknown[]) => {
    structuredClone(args);
    return Promise.resolve();
  },
}));
const invoke = vi.fn(electron.invoke);
vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_key: string, bridge: ControlBridge) => (electron.exposed = bridge),
  },
  ipcRenderer: { invoke, on: vi.fn(), off: vi.fn() },
}));
await import('../../src/preload/preload.cts');
const bridge = electron.exposed!;

// The page wires buttons straight to the bridge (onClick={bridge.quit}): Quit, Restart sky and
// Update now did nothing in the app, because React's click event went along and could not be cloned.
describe('the control preload', () => {
  it('sends a command as its channel alone, whatever the button hands it', () => {
    const clickEvent = { type: 'click', nativeEvent: { target: {} }, preventDefault: () => {} };
    const asButton = (command: () => void) => (command as (event: unknown) => void)(clickEvent);
    expect(() => asButton(bridge.quit)).not.toThrow();
    asButton(bridge.restartSky);
    asButton(bridge.updateNow);
    expect(invoke.mock.calls).toEqual([
      ['control:quit'],
      ['control:restartSky'],
      ['control:updateNow'],
    ]);
  });

  it('sends the test grid only its on/off', () => {
    invoke.mockClear();
    bridge.showTestGrid(true);
    expect(invoke).toHaveBeenCalledWith('control:showTestGrid', true);
  });
});
