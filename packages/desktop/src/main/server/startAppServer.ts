/**
 * The one HTTPS server both modes run: the web build, the data mirror and /ca.crt, on every
 * interface so tablets reach it. The relay attaches to the returned server, so the sky window and
 * the phones share its rooms.
 */
import { createServer } from 'node:https';
import type { Server } from 'node:https';
import type { AppRoots } from './@types/AppRoots';
import type { LanCertificate } from '../certificates/@types/LanCertificate';
import { APP_SERVER_PORT } from '../../data/appServerPort';
import { serveAppRequest } from './utils/serveAppRequest';

export async function startAppServer(
  roots: AppRoots,
  tls: LanCertificate,
  port = APP_SERVER_PORT,
): Promise<{ server: Server; close: () => Promise<void> }> {
  const server = createServer({ key: tls.key, cert: tls.cert }, (request, response) => {
    // A failed request must never take the main process (and the sky) down with it.
    serveAppRequest(request, response, roots).catch(() => {
      if (response.headersSent) response.destroy();
      else response.writeHead(500).end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject);
      resolve();
    });
  });
  // Without a listener a later error (EMFILE on accept) is uncaught and ends the main process.
  server.on('error', (error) => console.error('app server:', error));
  const close = () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  return { server, close };
}
