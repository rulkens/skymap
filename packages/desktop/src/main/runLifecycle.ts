/**
 * The app's life: one instance, the server and relay up, the control window, then the sky once the
 * data allows (spec §5 outcome table). Everything the control window can ask arrives as IPC from
 * that window only.
 */
import { app, dialog, globalShortcut, ipcMain, screen } from 'electron';
import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RelayRoom } from '../../../../src/@types/remote/RelayRoom.js';
import type { ControlStatus } from '../@types/ControlStatus.js';
import type { SyncOutcome } from '../@types/SyncOutcome.js';
import { APP_SERVER_PORT } from '../data/appServerPort.js';
import { CONTROL_SHORTCUT } from '../data/controlShortcut.js';
import { DATA_ORIGIN } from '../data/dataOrigin.js';
import { DEFAULT_INSTALL_SETUP } from '../data/defaultInstallSetup.js';
import { SETUP_FILE } from '../data/setupFile.js';
import { hasCompleteLocalSet } from '../sync/hasCompleteLocalSet.js';
import { InsufficientDiskError } from '../sync/InsufficientDiskError.js';
import { pruneOrphans } from '../sync/pruneOrphans.js';
import { runSync } from '../sync/runSync.js';
import { lanOriginFor } from '../utils/lanOriginFor.js';
import { listLanInterfaces } from '../utils/listLanInterfaces.js';
import { nextDailyRun } from '../utils/nextDailyRun.js';
import { parseInstallSetup } from '../utils/parseInstallSetup.js';
import { skyUrlFor } from '../utils/skyUrlFor.js';
import { storedDisplayMissing } from '../utils/storedDisplayMissing.js';
import { toDisplayInfo } from '../utils/toDisplayInfo.js';
import { attachDesktopRelay } from './attachDesktopRelay.js';
import { fillDisplay } from './fillDisplay.js';
import { openControlWindow } from './openControlWindow.js';
import { openSkyWindow } from './openSkyWindow.js';
import { placeWindows } from './placeWindows.js';
import { readRoomCode } from './readRoomCode.js';
import { readSetup } from './readSetup.js';
import { rotateRoomCode } from './rotateRoomCode.js';
import { saveSetup } from './saveSetup.js';
import { showTestGrid } from './showTestGrid.js';
import { startSecureServer } from './startSecureServer.js';
import { writeFileAtomically } from '../utils/writeFileAtomically.js';

export async function runLifecycle(windowed: boolean): Promise<void> {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  await app.whenReady();
  try {
    await start(windowed);
  } catch (error) {
    dialog.showErrorBox('Skymap could not start', String(error));
    app.quit();
  }
}

async function start(windowed: boolean): Promise<void> {
  const userData = app.getPath('userData');
  const dev = process.env.SKYMAP_DATA_DIR !== undefined;
  const dataRoot = process.env.SKYMAP_DATA_DIR ?? join(userData, 'data');
  const firstRun = !existsSync(join(userData, SETUP_FILE));
  let setup = await readSetup(userData);
  let code = await readRoomCode(userData);

  const server = await startSecureServer(userData, dataRoot);
  const relay = attachDesktopRelay(server, { code: () => code, network: () => setup.network });
  const control = openControlWindow();
  let sky: BrowserWindow | null = null;
  let status: ControlStatus = { kind: 'idle' };
  let room: RelayRoom | null = null;
  let syncing = false;
  let timer: NodeJS.Timeout | undefined;

  const send = (channel: string, payload: unknown): void => {
    if (!control.isDestroyed()) control.webContents.send(channel, payload);
  };
  const setStatus = (next: ControlStatus): void => {
    status = next;
    send('control:status', status);
  };
  const sendRoom = (next: RelayRoom): void => {
    room = next;
    send('control:pairing', room);
  };
  const openSky = (): BrowserWindow | null => (sky !== null && !sky.isDestroyed() ? sky : null);
  control.webContents.on('did-finish-load', () => {
    send('control:status', status);
    if (room !== null) send('control:pairing', room);
  });
  relay.onRoom(sendRoom);

  const showControl = (): void => {
    control.show();
    control.focus();
  };

  const placement = () => {
    const displays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();
    const { sky: skyInfo, control: controlInfo } = placeWindows(
      setup.display,
      displays.map((d) => toDisplayInfo(d, primary.id)),
    );
    const find = (id: number) => displays.find((d) => d.id === id) ?? primary;
    return {
      skyInfo,
      skyDisplay: find(skyInfo.id),
      controlDisplay: controlInfo === null ? null : find(controlInfo.id),
    };
  };

  // On one screen the control window floats over the sky and the shortcut hides it again.
  const placeAll = (): void => {
    const { skyInfo, skyDisplay, controlDisplay } = placement();
    const open = openSky();
    if (open && !windowed) fillDisplay(open, skyDisplay.bounds);
    control.setAlwaysOnTop(controlDisplay === null && !windowed, 'screen-saver');
    const { x, y, width, height } = (controlDisplay ?? skyDisplay).workArea;
    const [w = 0, h = 0] = control.getSize();
    control.setPosition(Math.round(x + (width - w) / 2), Math.round(y + (height - h) / 2));
    if (storedDisplayMissing(setup.display, skyInfo)) showControl();
  };

  const loadSky = async (): Promise<void> => {
    if (!dev) await pruneOrphans(dataRoot);
    const win = openSky() ?? (sky = openSkyWindow(placement().skyDisplay, windowed));
    await win.loadURL(skyUrlFor(setup.mode));
    if (status.kind === 'ready') setStatus({ kind: 'idle' });
  };
  const loadSkyLogged = (): void => void loadSky().catch((e) => console.error('sky load:', e));

  const sync = async (): Promise<SyncOutcome | 'disk'> => {
    syncing = true;
    setStatus({ kind: 'syncing' });
    try {
      return await runSync({
        baseUrl: DATA_ORIGIN,
        dataRoot,
        onProgress: (progress) => send('control:sync', progress),
      });
    } catch (error) {
      if (error instanceof InsufficientDiskError) {
        setStatus({ kind: 'diskFull', neededBytes: error.neededBytes, freeBytes: error.freeBytes });
        return 'disk';
      }
      console.error('sync:', error);
      return 'failed';
    } finally {
      syncing = false;
    }
  };

  // Spec §5's outcome table. `restart` is a scheduled or launch sync, which ends in a sky load;
  // Update now leaves a running sky alone until "Restart sky".
  const syncThenLoad = async (restart: boolean): Promise<void> => {
    if (syncing) return;
    const outcome = await sync();
    if (outcome === 'disk') return showControl();
    if (outcome === 'synced') {
      if (restart || !openSky()) return await loadSky();
      return setStatus({ kind: 'ready' });
    }
    const hasData = await hasCompleteLocalSet(dataRoot);
    setStatus({ kind: outcome, hasData });
    if (!hasData) return showControl();
    if (!openSky()) await loadSky();
  };

  const rearm = (): void => {
    clearTimeout(timer);
    const { dataUpdates } = setup;
    if (dev || dataUpdates.kind !== 'daily') return;
    const wait = nextDailyRun(dataUpdates.at, new Date()).getTime() - Date.now();
    timer = setTimeout(() => void syncThenLoad(true).finally(rearm), wait);
  };

  const fromControl = (event: IpcMainEvent | IpcMainInvokeEvent): boolean =>
    event.sender === control.webContents;
  const on = (channel: string, handle: (...args: unknown[]) => void): void => {
    ipcMain.on(channel, (event, ...args) => fromControl(event) && handle(...args));
  };
  ipcMain.handle('control:getSetup', (event) => (fromControl(event) ? setup : null));
  ipcMain.handle('control:listDisplays', (event) => {
    const primary = screen.getPrimaryDisplay().id;
    return fromControl(event) ? screen.getAllDisplays().map((d) => toDisplayInfo(d, primary)) : [];
  });
  ipcMain.handle('control:listNetworks', (event) =>
    fromControl(event) ? listLanInterfaces() : [],
  );
  ipcMain.handle('control:saveSetup', async (event, raw: unknown) => {
    if (!fromControl(event)) return;
    const previous = setup;
    setup = parseInstallSetup(raw);
    await saveSetup(userData, previous, setup, {
      placeWindows: placeAll,
      rearmUpdates: rearm,
      reloadSky: () => openSky() && loadSkyLogged(),
      // The code and host are unchanged; only the address the QR names moves.
      resendRoom: () => {
        if (room === null) return;
        sendRoom({
          ...room,
          origin: lanOriginFor(setup.network, listLanInterfaces(), APP_SERVER_PORT),
        });
      },
    });
  });
  on('control:updateNow', () => dev || void syncThenLoad(false));
  on('control:restartSky', loadSkyLogged);
  on('control:showTestGrid', (shown) => {
    const open = openSky();
    if (open) showTestGrid(open, setup.mode, shown === true);
  });
  on('control:rotateCode', () => {
    rotateRoomCode(userData, relay, code)
      .then((next) => (code = next))
      .catch((e: unknown) => console.error('rotate code:', e));
  });
  on('control:quit', () => app.quit());

  screen.on('display-added', placeAll);
  screen.on('display-removed', placeAll);
  const toggleControl = (): void => (control.isVisible() ? control.hide() : showControl());
  if (!globalShortcut.register(CONTROL_SHORTCUT, toggleControl)) {
    console.error(`${CONTROL_SHORTCUT} is taken by another app`);
  }
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('second-instance', showControl);
  app.on('window-all-closed', () => app.quit());

  placeAll();
  const complete = dev || (await hasCompleteLocalSet(dataRoot));
  if (firstRun)
    await writeFileAtomically(
      join(userData, SETUP_FILE),
      JSON.stringify(DEFAULT_INSTALL_SETUP, null, 2),
    );
  if (firstRun || !complete) showControl();
  if (dev || (complete && setup.dataUpdates.kind !== 'atLaunch')) await loadSky();
  else await syncThenLoad(true);
  rearm();
}
