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
// Main answers every request; a command's answer carries nothing the page waits for. A command sends
// only its channel: the page wires buttons straight to it (onClick={bridge.quit}), and React's click
// event, forwarded, cannot be cloned over IPC, so every such button failed without a word.
const command = (channel: string) => (): void => void ipcRenderer.invoke(channel);

const bridge: ControlBridge = {
  getState: () => ipcRenderer.invoke(C.getState),
  onState: subscribe(C.state),
  onHelp: subscribe(C.help),
  saveSetup: (setup) => ipcRenderer.invoke(C.saveSetup, setup),
  updateNow: command(C.updateNow),
  pauseSync: command(C.pauseSync),
  restartSky: command(C.restartSky),
  showTestGrid: (on) => void ipcRenderer.invoke(C.showTestGrid, on === true),
  rotateCode: () => ipcRenderer.invoke(C.rotateCode),
  hide: command(C.hide),
  quit: command(C.quit),
};

contextBridge.exposeInMainWorld('skymapControl', bridge);
