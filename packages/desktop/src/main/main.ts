import { app, BrowserWindow, dialog, session } from 'electron';
import { hostname } from 'node:os';
import { join, resolve } from 'node:path';
import type { LanNames } from '../@types/LanNames.js';
import { APP_SERVER_PORT } from '../data/appServerPort.js';
import { isSignedByCa } from '../utils/isSignedByCa.js';
import { listLanInterfaces } from '../utils/listLanInterfaces.js';
import { ensureLanCertificate } from './ensureLanCertificate.js';
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
  const win = new BrowserWindow({ width: 1280, height: 720, fullscreen: !windowed });
  void win.loadURL(`https://localhost:${APP_SERVER_PORT}/`);
}

void app.whenReady().then(() =>
  start().catch((error: unknown) => {
    dialog.showErrorBox('Skymap could not start', String(error));
    app.quit();
  }),
);

app.on('window-all-closed', () => app.quit());
