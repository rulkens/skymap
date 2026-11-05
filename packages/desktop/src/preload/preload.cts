/** Sandboxed preload (CommonJS, hence .cts): the control page's only door into the main process. */
import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type { ControlBridge } from '../@types/ControlBridge';
import { CONTROL_CHANNELS as C } from '../data/controlChannels';

function subscribe<A extends unknown[]>(channel: string) {
  return (listener: (...args: A) => void) => {
    const handler = (_event: IpcRendererEvent, ...args: A) => listener(...args);
    ipcRenderer.on(channel, handler);
    return () => void ipcRenderer.off(channel, handler);
  };
}
// Main answers every request; a command's answer carries nothing the page waits for.
const command =
  (channel: string) =>
  (...args: unknown[]): void =>
    void ipcRenderer.invoke(channel, ...args);

const bridge: ControlBridge = {
  getState: () => ipcRenderer.invoke(C.getState),
  onState: subscribe(C.state),
  onHelp: subscribe(C.help),
  saveSetup: (setup) => ipcRenderer.invoke(C.saveSetup, setup),
  updateNow: command(C.updateNow),
  pauseSync: command(C.pauseSync),
  restartSky: command(C.restartSky),
  showTestGrid: command(C.showTestGrid),
  rotateCode: () => ipcRenderer.invoke(C.rotateCode),
  hide: command(C.hide),
  quit: command(C.quit),
};

contextBridge.exposeInMainWorld('skymapControl', bridge);
