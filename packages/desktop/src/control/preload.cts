/** Sandboxed preload (CommonJS, hence .cts): the control page's only door into the main process. */
import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type { ControlBridge } from '../@types/ControlBridge.js';

function subscribe<T>(channel: string): (listener: (value: T) => void) => () => void {
  return (listener) => {
    const handler = (_event: IpcRendererEvent, value: T) => listener(value);
    ipcRenderer.on(channel, handler);
    return () => void ipcRenderer.off(channel, handler);
  };
}

const bridge: ControlBridge = {
  onSync: subscribe('control:sync'),
  onStatus: subscribe('control:status'),
  onPairing: subscribe('control:pairing'),
  updateNow: () => ipcRenderer.send('control:updateNow'),
  restartSky: () => ipcRenderer.send('control:restartSky'),
  getSetup: () => ipcRenderer.invoke('control:getSetup'),
  saveSetup: (setup) => ipcRenderer.invoke('control:saveSetup', setup),
  listDisplays: () => ipcRenderer.invoke('control:listDisplays'),
  listNetworks: () => ipcRenderer.invoke('control:listNetworks'),
  showTestGrid: (on) => ipcRenderer.send('control:showTestGrid', on),
  rotateCode: () => ipcRenderer.send('control:rotateCode'),
  quit: () => ipcRenderer.send('control:quit'),
};

contextBridge.exposeInMainWorld('skymapControl', bridge);
