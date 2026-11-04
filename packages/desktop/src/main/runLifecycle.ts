/**
 * The app's life: one instance, the server and relay up, the control window, then the sky once the
 * data allows (spec §5 outcome table). Everything the control window can ask arrives as IPC from
 * that window only.
 */
import { app, dialog, globalShortcut, ipcMain, nativeTheme, screen } from 'electron';
import type { BrowserWindow, Display, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { QuitGate } from '../@types/QuitGate';
import type { RelayRoom } from '../../../../src/@types/remote/RelayRoom';
import type { ControlStatus } from '../@types/ControlStatus';
import type { SyncOutcome } from '../@types/SyncOutcome';
import { APP_SERVER_PORT } from '../data/appServerPort';
import { CONTROL_SHORTCUT } from '../data/controlShortcut';
import { DEFAULT_INSTALL_SETUP } from '../data/defaultInstallSetup';
import { INVENTORY_FILE } from '../data/inventoryFile';
import { SETUP_FILE } from '../data/setupFile';
import { hasCompleteLocalSet } from '../sync/hasCompleteLocalSet';
import { InsufficientDiskError } from '../sync/InsufficientDiskError';
import { pruneOrphans } from '../sync/pruneOrphans';
import { runSync } from '../sync/runSync';
import { resolveDataRoot } from '../utils/resolveDataRoot';
import { serially } from '../utils/serially';
import { lanOriginFor } from '../utils/lanOriginFor';
import { listLanInterfaces } from '../utils/listLanInterfaces';
import { nextDailyRun } from '../utils/nextDailyRun';
import { parseInstallSetup } from '../utils/parseInstallSetup';
import { skyUrlFor } from '../utils/skyUrlFor';
import { storedDisplayMissing } from '../utils/storedDisplayMissing';
import { toDisplayInfo } from '../utils/toDisplayInfo';
import { attachDesktopRelay } from './attachDesktopRelay';
import { createQuitGate } from './createQuitGate';
import { createSkyLoader } from './createSkyLoader';
import { fillDisplay } from './fillDisplay';
import { installAppMenu } from './installAppMenu';
import { loadSkyPage } from './loadSkyPage';
import { openAboutWindow } from './openAboutWindow';
import { openControlWindow } from './openControlWindow';
import { openSkyWindow } from './openSkyWindow';
import { placeWindows } from './placeWindows';
import { readRoomCode } from './readRoomCode';
import { readSetup } from './readSetup';
import { rotateRoomCode } from './rotateRoomCode';
import { saveSetup } from './saveSetup';
import { showTestGrid } from './showTestGrid';
import { startSecureServer } from './startSecureServer';
import { writeFileAtomically } from '../utils/writeFileAtomically';

export async function runLifecycle(windowed: boolean): Promise<void> {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  await app.whenReady();
  const gate = createQuitGate();
  try {
    await start(windowed, gate);
  } catch (error) {
    dialog.showErrorBox('Skymap could not start', String(error));
    gate.allowQuit();
    app.quit();
  }
}

async function start(windowed: boolean, gate: QuitGate): Promise<void> {
  nativeTheme.themeSource = 'dark';
  const userData = app.getPath('userData');
  const { dataRoot, dev } = resolveDataRoot(
    process.env.SKYMAP_DATA_DIR,
    app.isPackaged,
    app.getAppPath(),
    userData,
  );
  const firstRun = !existsSync(join(userData, SETUP_FILE));
  let setup = await readSetup(userData);
  let code = await readRoomCode(userData);

  const server = await startSecureServer(userData, dataRoot);
  const relay = attachDesktopRelay(server, { code: () => code, network: () => setup.network });
  const control = openControlWindow(gate);
  const rotations = serially();
  let sky: BrowserWindow | null = null;
  let about: BrowserWindow | null = null;
  let testGrid = false;
  // The window can stand black before the sky loads into it: the test grid needs it during the first download.
  let skyRunning = false;
  let status: ControlStatus = { kind: 'idle' };
  // Known before the sky hosts, so a tablet can scan and trust the certificate during the first download.
  let room: RelayRoom = {
    code,
    origin: lanOriginFor(setup.network, listLanInterfaces(), APP_SERVER_PORT),
    onSky: false,
  };
  let syncing = false;
  let timer: NodeJS.Timeout | undefined;

  const send = (channel: string, ...payload: unknown[]): void => {
    if (!control.isDestroyed()) control.webContents.send(channel, ...payload);
  };
  const setStatus = (next: ControlStatus): void => {
    status = next;
    send('control:status', status);
  };
  const sendRoom = (next: RelayRoom): void => {
    room = next;
    send('control:pairing', room);
  };
  const setSkyRunning = (running: boolean): void => {
    skyRunning = running;
    send('control:sky', skyRunning);
  };
  const openSky = (): BrowserWindow | null => (sky !== null && !sky.isDestroyed() ? sky : null);
  const runningSky = (): BrowserWindow | null => (skyRunning ? openSky() : null);
  const newSky = (display: Display): BrowserWindow => {
    const win = openSkyWindow(display, windowed, gate);
    win.on('closed', () => setSkyRunning(false));
    return (sky = win);
  };
  const listDisplays = () => {
    const primary = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((d) => toDisplayInfo(d, primary));
  };
  control.webContents.on('did-finish-load', () => {
    send('control:status', status);
    send('control:sky', skyRunning);
    send('control:pairing', room);
    send('control:testGrid', testGrid);
  });
  relay.onRoom(sendRoom);

  // Never shown before its first paint: a first launch opens on the welcome step, not a blank window.
  const controlPainted = once(control, 'ready-to-show');
  const showControl = (): void =>
    void controlPainted.then(() => {
      control.show();
      control.focus();
    });
  const showAbout = (): void => {
    if (about === null || about.isDestroyed()) about = openAboutWindow(control);
    else about.focus();
  };

  const placement = () => {
    const displays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();
    const placed = placeWindows(
      setup.display,
      displays.map((d) => toDisplayInfo(d, primary.id)),
    );
    if (placed === null) return null;
    const { sky: skyInfo, control: controlInfo } = placed;
    const find = (id: number) => displays.find((d) => d.id === id) ?? primary;
    return {
      skyInfo,
      skyDisplay: find(skyInfo.id),
      controlDisplay: controlInfo === null ? null : find(controlInfo.id),
    };
  };

  // On one screen the control window floats over the sky and the shortcut hides it again.
  const placeAll = (): void => {
    const placed = placement();
    // display-removed can report none for a moment; the next display-added places everything.
    if (placed === null) return;
    const { skyInfo, skyDisplay, controlDisplay } = placed;
    const open = openSky();
    if (open && !windowed) fillDisplay(open, skyDisplay.bounds);
    control.setAlwaysOnTop(controlDisplay === null && !windowed, 'screen-saver');
    const { x, y, width, height } = (controlDisplay ?? skyDisplay).workArea;
    const [w = 0, h = 0] = control.getSize();
    control.setPosition(Math.round(x + (width - w) / 2), Math.round(y + (height - h) / 2));
    if (storedDisplayMissing(setup.display, skyInfo)) showControl();
  };

  const loadSky = createSkyLoader({
    isSyncing: () => syncing,
    prune: async () => {
      if (!dev) await pruneOrphans(dataRoot);
    },
    show: async () => {
      const display = placement()?.skyDisplay ?? screen.getPrimaryDisplay();
      const win = openSky() ?? newSky(display);
      await loadSkyPage(win, skyUrlFor(setup.mode));
      setSkyRunning(true);
      if (status.kind === 'ready') setStatus({ kind: 'idle' });
    },
    logError: (message, error) => console.error(message, error),
  });
  const loadSkyLogged = (): void => void loadSky();

  const sync = async (): Promise<SyncOutcome | 'disk'> => {
    syncing = true;
    setStatus({ kind: 'syncing' });
    try {
      return await runSync({
        baseUrl: DESKTOP_DATA_ORIGIN,
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
    if (outcome === 'disk') {
      if (!(await hasCompleteLocalSet(dataRoot))) return showControl();
      return runningSky() ? undefined : await loadSky();
    }
    if (outcome === 'synced') {
      setStatus({ kind: 'idle' });
      if (restart || !runningSky()) return await loadSky();
      return setStatus({ kind: 'ready' });
    }
    const hasData = await hasCompleteLocalSet(dataRoot);
    setStatus({ kind: outcome, hasData });
    if (!hasData) return showControl();
    if (!runningSky()) await loadSky();
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
  ipcMain.handle('control:isFirstRun', (event) => fromControl(event) && firstRun);
  ipcMain.handle('control:getSetup', (event) => (fromControl(event) ? setup : null));
  ipcMain.handle('control:listDisplays', (event) => (fromControl(event) ? listDisplays() : []));
  // The data's date is the last complete sync's: its inventory is written last.
  ipcMain.handle('control:getAbout', async (event) => {
    if (!fromControl(event) && event.sender !== about?.webContents) return null;
    const dataDate = await stat(join(dataRoot, INVENTORY_FILE)).then(
      (s) => s.mtime.toISOString(),
      () => null,
    );
    return { version: app.getVersion(), dataDate };
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
      reloadSky: () => runningSky() && loadSkyLogged(),
      // The code and host are unchanged; only the address the QR names moves.
      resendRoom: () =>
        sendRoom({
          ...room,
          origin: lanOriginFor(setup.network, listLanInterfaces(), APP_SERVER_PORT),
        }),
    });
  });
  on('control:updateNow', () => dev || void syncThenLoad(false));
  on('control:restartSky', loadSkyLogged);
  // Main holds the grid's state, so the page's checkbox and the View menu's tick agree.
  const setTestGrid = (on: boolean): void => {
    const display = placement()?.skyDisplay;
    const open = openSky() ?? (on && display ? newSky(display) : null);
    if (open) showTestGrid(open, setup.mode, on);
    testGrid = on && open !== null;
    send('control:testGrid', testGrid);
    tickTestGrid(testGrid);
  };
  const tickTestGrid = installAppMenu(control, windowed, {
    about: showAbout,
    showControl,
    showSky: () => openSky()?.focus(),
    quit: () => {
      gate.allowQuit();
      app.quit();
    },
    restartSky: loadSkyLogged,
    testGrid: setTestGrid,
    help: (section) => {
      showControl();
      send('control:view', 'help', section);
    },
  });
  on('control:showTestGrid', (shown) => setTestGrid(shown === true));
  on('control:rotateCode', () => {
    // Queued: a second click must rotate from the first one's new code, not the old one.
    rotations(async () => {
      code = await rotateRoomCode(userData, relay, code);
      // With no sky hosting, the relay announces nothing.
      sendRoom({ ...room, code });
    }).catch((e: unknown) => console.error('rotate code:', e));
  });
  on('control:hide', () => control.hide());
  on('control:quit', () => {
    gate.allowQuit();
    app.quit();
  });

  const displaysChanged = (): void => {
    placeAll();
    send('control:displays', listDisplays());
  };
  screen.on('display-added', displaysChanged);
  screen.on('display-removed', displaysChanged);
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
