/**
 * The app's life: one instance, the server and relay up, the control window, then the sky once the
 * data allows (spec §5 outcome table). Everything the control window can ask arrives as IPC from
 * that window only.
 */
import { app, dialog, globalShortcut, ipcMain, nativeTheme, screen } from 'electron';
import type { BrowserWindow, Display, WebContents } from 'electron';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { QuitGate } from '../windows/@types/QuitGate';
import type { Overlay } from '../sky/@types/Overlay';
import type { AboutInfo } from '../../@types/AboutInfo';
import type { ControlIpcHandlers } from './@types/ControlIpcHandlers';
import type { ControlState } from '../../@types/ControlState';
import type { SyncOutcome } from '../sync/@types/SyncOutcome';
import { APP_SERVER_PORT } from '../../data/appServerPort';
import { CONTROL_CHANNELS } from '../../data/controlChannels';
import { CONTROL_SHORTCUT } from '../../data/controlShortcut';
import { DEFAULT_INSTALL_SETUP } from '../setup/data/defaultInstallSetup';
import { INVENTORY_FILE } from '../sync/data/inventoryFile';
import { SETUP_FILE } from '../setup/data/setupFile';
import { hasCompleteLocalSet } from '../sync/hasCompleteLocalSet';
import { pruneOrphans } from '../sync/pruneOrphans';
import { runSync } from '../sync/runSync';
import { resolveDataRoot } from '../sync/utils/resolveDataRoot';
import { serially } from './utils/serially';
import { lanOriginFor } from '../lan/utils/lanOriginFor';
import { listLanInterfaces } from '../lan/utils/listLanInterfaces';
import { nextDailyRun } from '../sync/utils/nextDailyRun';
import { parseInstallSetup } from '../setup/utils/parseInstallSetup';
import { skyUrlFor } from '../sky/utils/skyUrlFor';
import { storedDisplayMissing } from '../../utils/storedDisplayMissing';
import { toDisplayInfo } from '../windows/utils/toDisplayInfo';
import { attachDesktopRelay } from '../relay/attachDesktopRelay';
import { createQuitGate } from '../windows/createQuitGate';
import { createSkyLoader } from '../sky/createSkyLoader';
import { fillDisplay } from '../windows/fillDisplay';
import { installAppMenu } from '../menu/installAppMenu';
import { loadSkyPage } from '../sky/loadSkyPage';
import { openAboutWindow } from '../windows/openAboutWindow';
import { openControlWindow } from '../windows/openControlWindow';
import { openSkyWindow } from '../windows/openSkyWindow';
import { placeWindows } from '../../utils/placeWindows';
import { readRoomCode } from '../relay/readRoomCode';
import { readSetup } from '../setup/readSetup';
import { registerControlIpc } from './registerControlIpc';
import { rotateRoomCode } from '../relay/rotateRoomCode';
import { saveSetup } from '../setup/saveSetup';
import { showTestGrid } from '../sky/showTestGrid';
import { startSecureServer } from '../server/startSecureServer';
import { writeFileAtomically } from '../files/utils/writeFileAtomically';

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
  let testGridOverlay: Overlay | null = null;
  let syncing = false;
  let timer: NodeJS.Timeout | undefined;

  const listDisplays = () => {
    const primary = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((d) => toDisplayInfo(d, primary));
  };
  // The data's date is the last complete sync's: its inventory is written last.
  const readAbout = async (): Promise<AboutInfo> => ({
    version: app.getVersion(),
    dataDate: await stat(join(dataRoot, INVENTORY_FILE)).then(
      (s) => s.mtime.toISOString(),
      () => null,
    ),
  });
  let state: ControlState = {
    status: { kind: 'idle' },
    progress: null,
    hasData: dev || (await hasCompleteLocalSet(dataRoot)),
    // The window can stand black before the sky loads into it: the test grid needs it during the first download.
    skyRunning: false,
    testGrid: false,
    // Known before the sky hosts, so a tablet can scan and trust the certificate during the first download.
    room: {
      code,
      origin: lanOriginFor(setup.network, listLanInterfaces(), APP_SERVER_PORT),
      onSky: false,
    },
    displays: listDisplays(),
    networks: listLanInterfaces(),
    setup,
    firstRun,
    about: await readAbout(),
  };
  const update = (patch: Partial<ControlState>): void => {
    state = { ...state, ...patch };
    if (!control.isDestroyed()) control.webContents.send(CONTROL_CHANNELS.state, state);
  };
  const openSky = (): BrowserWindow | null => (sky !== null && !sky.isDestroyed() ? sky : null);
  const runningSky = (): BrowserWindow | null => (state.skyRunning ? openSky() : null);
  const newSky = (display: Display): BrowserWindow => {
    const win = openSkyWindow(display, windowed, gate);
    win.on('closed', () => update({ skyRunning: false }));
    return (sky = win);
  };
  relay.onRoom((room) => update({ room }));

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
    // The ids came from `displays` itself.
    const find = (id: number) => displays.find((d) => d.id === id) as Display;
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
      update({ skyRunning: true });
      if (state.status.kind === 'ready') update({ status: { kind: 'complete' } });
    },
    logError: (message, error) => console.error(message, error),
  });
  const loadSkyLogged = (): void => void loadSky();

  const sync = async (): Promise<SyncOutcome> => {
    syncing = true;
    update({ status: { kind: 'syncing' }, progress: null });
    try {
      return await runSync({
        baseUrl: DESKTOP_DATA_ORIGIN,
        dataRoot,
        onProgress: (progress) => update({ progress }),
      });
    } catch (error) {
      console.error('sync:', error);
      return { kind: 'failed' };
    } finally {
      syncing = false;
    }
  };

  // Spec §5's outcome table. `restart` is a scheduled or launch sync, which ends in a sky load;
  // Update now leaves a running sky alone until "Restart sky".
  const syncThenLoad = async (restart: boolean): Promise<void> => {
    if (syncing) return;
    // A sky still waiting for Restart sky is stale even when this sync finds nothing new.
    const stale = state.status.kind === 'ready';
    const outcome = await sync();
    if (outcome.kind === 'synced' || outcome.kind === 'unchanged') {
      update({ hasData: true, about: await readAbout() });
      const changed = outcome.kind === 'synced' || stale;
      if (!runningSky() || (restart && changed)) {
        update({ status: { kind: 'complete' } });
        return await loadSky();
      }
      return update({ status: { kind: changed ? 'ready' : 'complete' } });
    }
    update({ status: outcome, hasData: await hasCompleteLocalSet(dataRoot) });
    if (!state.hasData) return showControl();
    if (!runningSky()) await loadSky();
  };

  const rearm = (): void => {
    clearTimeout(timer);
    const { dataUpdates } = setup;
    if (dev || dataUpdates.kind !== 'daily') return;
    const wait = nextDailyRun(dataUpdates.at, new Date()).getTime() - Date.now();
    timer = setTimeout(() => void syncThenLoad(true).finally(rearm), wait);
  };

  // Main holds the grid's state, so the page's checkbox and the View menu's tick agree.
  const setTestGrid = (on: boolean): void => {
    const display = placement()?.skyDisplay;
    const open = openSky() ?? (on && display ? newSky(display) : null);
    void testGridOverlay?.close().catch(() => {});
    testGridOverlay = on && open && !open.isDestroyed() ? showTestGrid(open, setup.mode) : null;
    update({ testGrid: on && open !== null });
    tickTestGrid(state.testGrid);
  };
  const quit = (): void => {
    gate.allowQuit();
    app.quit();
  };
  const tickTestGrid = installAppMenu(control, windowed, {
    about: showAbout,
    showControl,
    showSky: () => openSky()?.focus(),
    quit,
    restartSky: loadSkyLogged,
    testGrid: setTestGrid,
    help: (section) => {
      showControl();
      if (!control.isDestroyed()) control.webContents.send(CONTROL_CHANNELS.view, 'help', section);
    },
  });

  const handlers: ControlIpcHandlers = {
    getState: () => state,
    saveSetup: async (raw) => {
      const previous = setup;
      setup = parseInstallSetup(raw);
      update({ setup });
      await saveSetup(userData, previous, setup, {
        placeWindows: placeAll,
        rearmUpdates: rearm,
        reloadSky: () => runningSky() && loadSkyLogged(),
        // The code and host are unchanged; only the address the QR names moves.
        resendRoom: () =>
          update({
            room: {
              ...state.room,
              origin: lanOriginFor(setup.network, listLanInterfaces(), APP_SERVER_PORT),
            },
          }),
      });
    },
    updateNow: () => dev || void syncThenLoad(false),
    restartSky: loadSkyLogged,
    showTestGrid: (shown) => setTestGrid(shown === true),
    rotateCode: () =>
      // Queued: a second click must rotate from the first one's new code, not the old one.
      rotations(async () => {
        code = await rotateRoomCode(userData, relay, code);
        // With no sky hosting, the relay announces nothing.
        update({ room: { ...state.room, code } });
      }).catch((e: unknown) => console.error('rotate code:', e)),
    hide: () => control.hide(),
    quit,
  };
  // The About window reads the state for its facts and may ask nothing else.
  const isAllowed = (sender: WebContents, request: keyof ControlIpcHandlers): boolean =>
    sender === control.webContents || (sender === about?.webContents && request === 'getState');
  registerControlIpc(ipcMain, isAllowed, handlers);

  const displaysChanged = (): void => {
    placeAll();
    update({ displays: listDisplays() });
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
  const complete = state.hasData;
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
