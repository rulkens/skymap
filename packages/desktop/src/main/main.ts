import { app, dialog, screen, session } from 'electron';
import type { Display } from 'electron';
import { hostname } from 'node:os';
import { join, resolve } from 'node:path';
import type { InstallSetup } from '../@types/InstallSetup.js';
import type { LanNames } from '../@types/LanNames.js';
import { isSignedByCa } from '../utils/isSignedByCa.js';
import { listLanInterfaces } from '../utils/listLanInterfaces.js';
import { readJsonFile } from '../utils/readJsonFile.js';
import { toDisplayInfo } from '../utils/toDisplayInfo.js';
import { ensureLanCertificate } from './ensureLanCertificate.js';
import { fillDisplay } from './fillDisplay.js';
import { openSkyWindow } from './openSkyWindow.js';
import { placeWindows } from './placeWindows.js';
import { startAppServer } from './startAppServer.js';

const windowed = process.argv.includes('--windowed');

async function start(): Promise<void> {
  const userData = app.getPath('userData');
  const host = hostname()
    .replace(/\.local$/i, '')
    .toLowerCase();
  const names: LanNames = {
    hostnames: ['localhost', `${host}.local`],
    ips: listLanInterfaces().map((lan) => lan.address),
  };
  const tls = await ensureLanCertificate(join(userData, 'certs'), names);
  // -3 hands every other chain back to Chromium's own verdict.
  session.defaultSession.setCertificateVerifyProc((request, callback) =>
    callback(isSignedByCa(request.certificate.data, tls.ca) ? 0 : -3),
  );
  await startAppServer(
    {
      dist: resolve(app.getAppPath(), '../../dist'),
      data: process.env.SKYMAP_DATA_DIR ?? join(userData, 'data'),
      caPem: tls.ca,
    },
    tls,
  );
  // Read raw until the control window's task brings readSetup with its defaults.
  const setup = await readJsonFile<InstallSetup>(join(userData, 'setup.json'));
  const sky = openSkyWindow(skyDisplay(setup?.display ?? null), setup?.mode ?? 'kiosk', windowed);
  const replace = () => {
    if (!windowed && !sky.isDestroyed())
      fillDisplay(sky, skyDisplay(setup?.display ?? null).bounds);
  };
  screen.on('display-added', replace);
  screen.on('display-removed', replace);
}

function skyDisplay(stored: InstallSetup['display']): Display {
  const displays = screen.getAllDisplays();
  const primaryId = screen.getPrimaryDisplay().id;
  const { sky } = placeWindows(
    stored,
    displays.map((d) => toDisplayInfo(d, primaryId)),
  );
  return displays.find((d) => d.id === sky.id) ?? screen.getPrimaryDisplay();
}

void app.whenReady().then(() =>
  start().catch((error: unknown) => {
    dialog.showErrorBox('Skymap could not start', String(error));
    app.quit();
  }),
);

app.on('window-all-closed', () => app.quit());
