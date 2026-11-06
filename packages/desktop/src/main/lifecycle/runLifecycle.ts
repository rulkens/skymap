/**
 * The app's life, as wiring: one instance, the server and relay up, the control window, then the
 * sky once the data allows. Decisions live in the pieces it wires (bootPlan, createSyncThenLoad,
 * createDailySchedule, createSetupStore, createSkyWindows); main owns one ControlState and pushes
 * it whole to the control page on every change.
 */
import {
  app,
  ipcMain,
  nativeTheme,
  powerSaveBlocker,
  screen,
  shell,
  systemPreferences,
} from 'electron';
import type { BrowserWindow, WebContents } from 'electron';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { AboutInfo } from '../../@types/AboutInfo';
import type { ControlIpcHandlers } from './@types/ControlIpcHandlers';
import type { ControlState } from '../../@types/ControlState';
import type { LanInterface } from '../../@types/LanInterface';
import { APP_SERVER_PORT } from '../../data/appServerPort';
import { CONTROL_CHANNELS } from '../../data/controlChannels';
import { INVENTORY_FILE } from '../sync/data/inventoryFile';
import { attachDesktopRelay } from '../relay/attachDesktopRelay';
import { bootPlan } from './utils/bootPlan';
import { createDailySchedule } from './createDailySchedule';
import { createSetupStore } from '../setup/createSetupStore';
import { createSkyLoader } from '../sky/createSkyLoader';
import { createSkyWindows } from '../windows/createSkyWindows';
import { createSyncThenLoad } from './createSyncThenLoad';
import { hasCompleteLocalSet } from '../sync/hasCompleteLocalSet';
import { installAppMenu } from '../menu/installAppMenu';
import { parseSkyWindowState } from '../windows/utils/parseSkyWindowState';
import { openSettings } from '../settings/openSettings';
import { isNewerBuild } from './utils/isNewerBuild';
import { lanOriginFor } from '../lan/utils/lanOriginFor';
import { listDisplays } from '../windows/utils/listDisplays';
import { listLanInterfaces } from '../lan/utils/listLanInterfaces';
import { loadSkyPage } from '../sky/loadSkyPage';
import { openAboutWindow } from '../windows/openAboutWindow';
import { openControlWindow } from '../windows/openControlWindow';
import { parseInstallSetup } from '../setup/utils/parseInstallSetup';
import { pruneOrphans } from '../sync/pruneOrphans';
import { readRoomCode } from '../relay/readRoomCode';
import { readSetup } from '../setup/readSetup';
import { registerControlIpc } from './registerControlIpc';
import { resolveDataRoot } from '../sync/utils/resolveDataRoot';
import { rotateRoomCode } from '../relay/rotateRoomCode';
import { runSync } from '../sync/runSync';
import { serially } from './utils/serially';
import { DOCS_BASE } from '../menu/data/docsBase';
import { SKY_DRAG_CHANNEL } from '../../data/skyDragChannel';
import { SKY_ESCAPE_CHANNEL } from '../../data/skyEscapeChannel';
import { dragWithCursor } from '../windows/utils/dragWithCursor';
import { skyUrlFor } from '../sky/utils/skyUrlFor';
import { startSecureServer } from '../server/startSecureServer';
import { startTabletSetupServer } from '../server/startTabletSetupServer';
import { takeInstanceLock } from './utils/takeInstanceLock';
import { watchLan } from '../lan/watchLan';
import { watchQuitting } from '../windows/watchQuitting';

/**
 * Rejects only when the app cannot start, before the control window opens; main.ts shows why and
 * exits. Once it is open, a failure is logged and the person at the control window sees the status.
 */
export async function runLifecycle(windowed: boolean): Promise<void> {
  if (!(await takeInstanceLock(DESKTOP_BUILT_AT))) return app.quit();
  // macOS adds its own "Enter Full Screen" to a View menu; ours (View › Full screen) is the one that
  // knows the sky's simple full screen, so the system's is switched off before the menu is built.
  if (process.platform === 'darwin') {
    systemPreferences.setUserDefault('NSFullScreenMenuItemEverywhere', 'boolean', false);
  }
  await app.whenReady();
  nativeTheme.themeSource = 'dark';
  const mayClose = watchQuitting(app);
  const userData = app.getPath('userData');
  const { dataRoot, dev } = resolveDataRoot(
    process.env.SKYMAP_DATA_DIR,
    app.isPackaged,
    app.getAppPath(),
    userData,
  );
  const settings = openSettings(userData);
  const firstRun = !settings.has('setup');
  let code = readRoomCode(settings);
  const secure = await startSecureServer(userData, dataRoot);
  await startTabletSetupServer(secure.caPem);
  // Syncs, prunes and sky loads one at a time: a prune never meets a download, two loads never overlap.
  const work = serially();
  const rotations = serially();
  let about: BrowserWindow | null = null;
  let awake: number | null = null;
  // A sky Escape made a window belongs to the operator, so it carries the menu (installAppMenu).
  let skyFull = !windowed;

  const setup = createSetupStore(settings, readSetup(settings), {
    placeWindows: () => placeAll(),
    rearmUpdates: () => rearm(),
    modeChanged: () => {
      setTestGrid(false);
      // A first load may have read the old mode already; the reload queues behind it.
      if (state.skyRunning || state.skyLoading) void loadSky();
    },
    networkChanged: () => update({ room: { ...state.room, origin: originFor(state.networks) } }),
    autostartChanged: (on) => setAutostart(on),
  });
  const setAutostart = (on: boolean) =>
    app.isPackaged && app.setLoginItemSettings({ openAtLogin: on });
  // Every launch too: a reinstall to another folder leaves the OS entry on the old executable.
  // Only when on: removing an entry that is not there logs an error on macOS at every launch.
  if (setup.current().autostart) setAutostart(true);
  const originFor = (networks: LanInterface[]): string =>
    lanOriginFor(setup.current().network, networks, APP_SERVER_PORT);
  const relay = attachDesktopRelay(secure.server, {
    code: () => code,
    network: () => setup.current().network,
  });
  // The data's date is the last complete sync's: its inventory is written last.
  const readAbout = async (): Promise<AboutInfo> => ({
    version: app.getVersion(),
    builtAt: DESKTOP_BUILT_AT,
    dataDate: await stat(join(dataRoot, INVENTORY_FILE)).then(
      (s) => s.mtime.toISOString(),
      () => null,
    ),
  });
  const networks = listLanInterfaces();
  let state: ControlState = {
    status: { kind: 'idle' },
    progress: null,
    hasData: dev || (await hasCompleteLocalSet(dataRoot)),
    skyRunning: false,
    skyLoading: false,
    testGrid: false,
    // Known before the sky hosts, so a tablet can scan and trust the certificate during the first download.
    room: { code, origin: originFor(networks), onSky: false },
    displays: listDisplays(),
    placement: null,
    networks,
    setup: setup.current(),
    firstRun,
    about: await readAbout(),
    lastAttempt: null,
  };
  // Nothing awaits from here to registerControlIpc, so the page's first getState finds its handler.
  const { window: control, show: showControl } = openControlWindow(mayClose);
  const sky = createSkyWindows({
    control,
    windowed,
    mayClose,
    setup: () => setup.current(),
    onClosed: () => update({ skyRunning: false }),
    onFullScreen: (full) => {
      skyFull = full;
      tick('fullScreen', full);
    },
    left: parseSkyWindowState(settings.get('skyWindow')),
    showControl: () => showControl(),
    remember: (left) => {
      try {
        settings.set('skyWindow', left);
      } catch (error) {
        console.error('sky window state:', error);
      }
    },
  });
  const update = (patch: Partial<ControlState>): void => {
    state = { ...state, ...patch };
    if (!control.isDestroyed()) control.webContents.send(CONTROL_CHANNELS.state, state);
  };
  relay.onRoom((room) => update({ room }));

  const showAbout = (): void => {
    if (about === null || about.isDestroyed()) about = openAboutWindow(control);
    else about.focus();
  };
  // Raised when the stored display goes missing, not on every metrics event while it stays missing.
  const placeAll = (): void => {
    const wasMissing = state.placement?.storedMissing === true;
    update({ displays: listDisplays(), placement: sky.place() });
    if (state.placement?.storedMissing && !wasMissing) showControl();
  };

  const loadOnce = createSkyLoader({
    prune: () => (dev ? Promise.resolve() : pruneOrphans(dataRoot)),
    show: async () => {
      update({ skyLoading: true });
      try {
        await loadSkyPage(sky.open(), skyUrlFor(setup.current().mode));
        update({ skyRunning: true });
        // Tablets steering over the relay are no local input, so the OS would blank the screen and sleep.
        awake ??= powerSaveBlocker.start('prevent-display-sleep');
        if (state.status.kind === 'ready') update({ status: { kind: 'complete' } });
      } finally {
        update({ skyLoading: false });
      }
    },
    logError: (message, error) => console.error(message, error),
  });
  const loadSky = (): Promise<void> => work(loadOnce);

  const { syncThenLoad, pause: pauseSync } = createSyncThenLoad({
    sync: (signal, onProgress) =>
      work(() => runSync({ baseUrl: DESKTOP_DATA_ORIGIN, dataRoot, signal, onProgress })),
    hasCompleteSet: () => hasCompleteLocalSet(dataRoot),
    state: () => state,
    update,
    readAbout,
    showControl,
    loadSky,
  });
  const rearm = createDailySchedule({
    run: () => syncThenLoad(true),
    policy: () => setup.current().dataUpdates,
    dev,
  });

  // Main holds the grid's state, so the page's checkbox and the View menu's tick agree.
  const setTestGrid = (on: boolean): void => {
    update({ testGrid: sky.setTestGrid(on) });
    tick('testGrid', state.testGrid);
  };
  // Without a complete set the sky has nothing to show; the page disables the button for the same reason.
  const restartSky = (): void => void (state.hasData && loadSky());
  const tick = installAppMenu(control, windowed, (win) => !skyFull && win === sky.current(), {
    about: showAbout,
    showControl,
    showSky: () => sky.current()?.focus(),
    restartSky,
    testGrid: setTestGrid,
    fullScreen: (on) => sky.setFullScreen(on),
    help: (section) => {
      showControl();
      if (!control.isDestroyed()) control.webContents.send(CONTROL_CHANNELS.help, section);
    },
    openDocs: (path) => void shell.openExternal(new URL(path, DOCS_BASE).href),
  });

  const handlers: ControlIpcHandlers = {
    getState: () => state,
    saveSetup: async (raw) => {
      await setup.save(parseInstallSetup(raw));
      // A page reloaded after a crash then opens on the controls, not the welcome step.
      update({ setup: setup.current(), firstRun: false });
    },
    updateNow: () => dev || void syncThenLoad(false),
    pauseSync,
    restartSky,
    showTestGrid: (shown) => setTestGrid(shown === true),
    // Queued: a second click must rotate from the first one's new code, not the old one.
    rotateCode: () =>
      rotations(async () => {
        code = rotateRoomCode(settings, relay, code);
        // With no sky hosting, the relay announces nothing.
        update({ room: { ...state.room, code } });
      }),
    hide: () => control.hide(),
    quit: () => app.quit(),
  };
  // The About window reads the state for its facts and may ask nothing else.
  const isAllowed = (sender: WebContents, request: keyof ControlIpcHandlers): boolean =>
    sender === control.webContents || (sender === about?.webContents && request === 'getState');
  registerControlIpc(ipcMain, isAllowed, handlers);
  // Only the sky's own preload may drop it out of full screen, or move it.
  ipcMain.on(SKY_ESCAPE_CHANNEL, (event) => {
    if (event.sender === sky.current()?.webContents) sky.setFullScreen(false);
  });
  let stopDrag: (() => void) | null = null;
  ipcMain.on(SKY_DRAG_CHANNEL, (event, on: unknown) => {
    const win = sky.current();
    if (win === null || event.sender !== win.webContents) return;
    stopDrag?.();
    stopDrag = on === true ? dragWithCursor(win, () => screen.getCursorScreenPoint()) : null;
  });

  screen.on('display-added', placeAll);
  screen.on('display-removed', placeAll);
  screen.on('display-metrics-changed', placeAll);
  watchLan(listLanInterfaces, (interfaces) => {
    update({ networks: interfaces, room: { ...state.room, origin: originFor(interfaces) } });
    secure
      .renewCertificate()
      .catch((error: unknown) => console.error('certificate renewal:', error));
  });
  // A newer build opened beside this one takes over: every installer says 0.5.0, so a running old
  // build would otherwise keep answering for the new one.
  app.on('second-instance', (_event, _argv, _cwd, data) =>
    isNewerBuild(data, DESKTOP_BUILT_AT) ? app.quit() : showControl(),
  );
  app.on('window-all-closed', () => app.quit());

  placeAll();
  const plan = bootPlan({
    firstRun,
    dev,
    hasData: state.hasData,
    dataUpdates: setup.current().dataUpdates,
  });
  // A first run ends here: its setup is stored at once, and the next launch skips the steps.
  if (firstRun) {
    await setup.save(setup.current()).catch((error: unknown) => console.error('setup:', error));
  }
  if (plan.showControl) showControl();
  if (plan.start === 'load') await loadSky();
  else await syncThenLoad(true);
  rearm();
}
