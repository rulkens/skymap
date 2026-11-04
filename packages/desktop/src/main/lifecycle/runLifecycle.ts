/**
 * The app's life, as wiring: one instance, the server and relay up, the control window, then the
 * sky once the data allows. Decisions live in the pieces it wires (bootPlan, syncOutcomeAction,
 * createDailySchedule, createSetupStore, createSkyWindows); main owns one ControlState and pushes
 * it whole to the control page on every change.
 */
import { app, globalShortcut, ipcMain, nativeTheme, screen } from 'electron';
import type { BrowserWindow, WebContents } from 'electron';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { AboutInfo } from '../../@types/AboutInfo';
import type { ControlIpcHandlers } from './@types/ControlIpcHandlers';
import type { ControlState } from '../../@types/ControlState';
import type { LanInterface } from '../../@types/LanInterface';
import type { SyncOutcome } from '../sync/@types/SyncOutcome';
import { APP_SERVER_PORT } from '../../data/appServerPort';
import { CONTROL_CHANNELS } from '../../data/controlChannels';
import { CONTROL_SHORTCUT } from '../../data/controlShortcut';
import { INVENTORY_FILE } from '../sync/data/inventoryFile';
import { SETUP_FILE } from '../setup/data/setupFile';
import { attachDesktopRelay } from '../relay/attachDesktopRelay';
import { bootPlan } from './utils/bootPlan';
import { createDailySchedule } from './createDailySchedule';
import { createQuitGate } from '../windows/createQuitGate';
import { createSetupStore } from '../setup/createSetupStore';
import { createSkyLoader } from '../sky/createSkyLoader';
import { createSkyWindows } from '../windows/createSkyWindows';
import { hasCompleteLocalSet } from '../sync/hasCompleteLocalSet';
import { installAppMenu } from '../menu/installAppMenu';
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
import { skyUrlFor } from '../sky/utils/skyUrlFor';
import { startSecureServer } from '../server/startSecureServer';
import { syncOutcomeAction } from './utils/syncOutcomeAction';
import { watchLan } from '../lan/watchLan';

/** Rejects when the app cannot start; main.ts shows why and exits. */
export async function runLifecycle(windowed: boolean): Promise<void> {
  if (!app.requestSingleInstanceLock()) return app.quit();
  await app.whenReady();
  nativeTheme.themeSource = 'dark';
  const gate = createQuitGate();
  const userData = app.getPath('userData');
  const { dataRoot, dev } = resolveDataRoot(
    process.env.SKYMAP_DATA_DIR,
    app.isPackaged,
    app.getAppPath(),
    userData,
  );
  const firstRun = !existsSync(join(userData, SETUP_FILE));
  let code = await readRoomCode(userData);
  const secure = await startSecureServer(userData, dataRoot);
  // Syncs, prunes and sky loads one at a time: a prune never meets a download, two loads never overlap.
  const work = serially();
  const rotations = serially();
  let about: BrowserWindow | null = null;
  let syncing = false;

  const setup = createSetupStore(userData, await readSetup(userData), {
    placeWindows: () => placeAll(),
    rearmUpdates: () => rearm(),
    modeChanged: () => {
      setTestGrid(false);
      if (state.skyRunning) void loadSky();
    },
    networkChanged: () => update({ room: { ...state.room, origin: originFor(state.networks) } }),
    autostartChanged: (on) => app.isPackaged && app.setLoginItemSettings({ openAtLogin: on }),
  });
  const originFor = (networks: LanInterface[]): string =>
    lanOriginFor(setup.current().network, networks, APP_SERVER_PORT);
  const relay = attachDesktopRelay(secure.server, {
    code: () => code,
    network: () => setup.current().network,
  });
  // The data's date is the last complete sync's: its inventory is written last.
  const readAbout = async (): Promise<AboutInfo> => ({
    version: app.getVersion(),
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
  };
  // Nothing awaits from here to registerControlIpc, so the page's first getState finds its handler.
  const { window: control, show: showControl } = openControlWindow(gate);
  const sky = createSkyWindows({
    control,
    windowed,
    gate,
    setup: () => setup.current(),
    onClosed: () => update({ skyRunning: false }),
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
  const placeAll = (): void => {
    update({ displays: listDisplays(), placement: sky.place() });
    if (state.placement?.storedMissing) showControl();
  };

  const loadOnce = createSkyLoader({
    prune: () => (dev ? Promise.resolve() : pruneOrphans(dataRoot)),
    show: async () => {
      update({ skyLoading: true });
      try {
        await loadSkyPage(sky.open(), skyUrlFor(setup.current().mode));
        update({ skyRunning: true });
        if (state.status.kind === 'ready') update({ status: { kind: 'complete' } });
      } finally {
        update({ skyLoading: false });
      }
    },
    logError: (message, error) => console.error(message, error),
  });
  const loadSky = (): Promise<void> => work(loadOnce);

  // `restart`: a launch or daily sync, which ends in a sky load; Update now waits for Restart sky.
  const syncThenLoad = async (restart: boolean): Promise<void> => {
    if (syncing) return;
    syncing = true;
    const skyStale = state.status.kind === 'ready';
    update({ status: { kind: 'syncing' }, progress: null });
    const outcome = await work(() =>
      runSync({
        baseUrl: DESKTOP_DATA_ORIGIN,
        dataRoot,
        onProgress: (progress) => update({ progress }),
      }),
    )
      .catch((error: unknown): SyncOutcome => {
        console.error('sync:', error);
        return { kind: 'failed' };
      })
      .finally(() => (syncing = false));
    const done = outcome.kind === 'synced' || outcome.kind === 'unchanged';
    const hasData = done || (await hasCompleteLocalSet(dataRoot));
    const action = syncOutcomeAction({
      outcome,
      hasData,
      skyRunning: state.skyRunning,
      skyStale,
      restart,
    });
    update({ status: action.status, hasData, about: await readAbout() });
    if (action.then === 'showControl') showControl();
    if (action.then === 'loadSky') await loadSky();
  };
  const rearm = createDailySchedule({
    run: () => syncThenLoad(true),
    policy: () => setup.current().dataUpdates,
    dev,
  });

  // Main holds the grid's state, so the page's checkbox and the View menu's tick agree.
  const setTestGrid = (on: boolean): void => {
    update({ testGrid: sky.setTestGrid(on) });
    tickTestGrid(state.testGrid);
  };
  const quit = (): void => {
    gate.allowQuit();
    app.quit();
  };
  // Without a complete set the sky has nothing to show; the page disables the button for the same reason.
  const restartSky = (): void => void (state.hasData && loadSky());
  const tickTestGrid = installAppMenu(control, windowed, {
    about: showAbout,
    showControl,
    showSky: () => sky.current()?.focus(),
    quit,
    restartSky,
    testGrid: setTestGrid,
    help: (section) => {
      showControl();
      if (!control.isDestroyed()) control.webContents.send(CONTROL_CHANNELS.view, 'help', section);
    },
  });

  const handlers: ControlIpcHandlers = {
    getState: () => state,
    saveSetup: async (raw) => {
      await setup.save(parseInstallSetup(raw));
      update({ setup: setup.current() });
    },
    updateNow: () => dev || void syncThenLoad(false),
    restartSky,
    showTestGrid: (shown) => setTestGrid(shown === true),
    // Queued: a second click must rotate from the first one's new code, not the old one.
    rotateCode: () =>
      rotations(async () => {
        code = await rotateRoomCode(userData, relay, code);
        // With no sky hosting, the relay announces nothing.
        update({ room: { ...state.room, code } });
      }),
    hide: () => control.hide(),
    quit,
  };
  // The About window reads the state for its facts and may ask nothing else.
  const isAllowed = (sender: WebContents, request: keyof ControlIpcHandlers): boolean =>
    sender === control.webContents || (sender === about?.webContents && request === 'getState');
  registerControlIpc(ipcMain, isAllowed, handlers);

  screen.on('display-added', placeAll);
  screen.on('display-removed', placeAll);
  screen.on('display-metrics-changed', placeAll);
  watchLan(listLanInterfaces, (interfaces) => {
    update({ networks: interfaces, room: { ...state.room, origin: originFor(interfaces) } });
    secure
      .renewCertificate()
      .catch((error: unknown) => console.error('certificate renewal:', error));
  });
  const toggleControl = (): void => (control.isVisible() ? control.hide() : showControl());
  if (!globalShortcut.register(CONTROL_SHORTCUT, toggleControl)) {
    console.error(`${CONTROL_SHORTCUT} is taken by another app`);
  }
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('second-instance', showControl);
  app.on('window-all-closed', () => app.quit());

  placeAll();
  const plan = bootPlan({
    firstRun,
    dev,
    hasData: state.hasData,
    dataUpdates: setup.current().dataUpdates,
  });
  // A first run ends here: its setup is stored at once, and the next launch skips the steps.
  if (firstRun) await setup.save(setup.current());
  if (plan.showControl) showControl();
  if (plan.start === 'load') await loadSky();
  else await syncThenLoad(true);
  rearm();
}
