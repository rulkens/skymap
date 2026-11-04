/**
 * The one HTTPS server both modes run: the web build, the data mirror and /ca.crt, on every
 * interface so tablets reach it. The relay attaches to the returned server, so the sky window and
 * the phones share its rooms.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:https';
import type { Server } from 'node:https';
import { extname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { AppRoots } from '../@types/AppRoots.js';
import type { LanCertificate } from '../@types/LanCertificate.js';
import { APP_SERVER_PORT } from '../data/appServerPort.js';
import { CONTENT_TYPE_BY_EXTENSION } from '../data/contentTypeByExtension.js';
import { resolveAppPath } from './resolveAppPath.js';

export async function startAppServer(
  roots: AppRoots,
  tls: LanCertificate,
  port = APP_SERVER_PORT,
): Promise<{ server: Server; close: () => Promise<void> }> {
  const server = createServer({ key: tls.key, cert: tls.cert }, (request, response) => {
    // A failed request must never take the main process (and the sky) down with it.
    serve(request, response, roots).catch(() => {
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
  const close = () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  return { server, close };
}

async function serve(request: IncomingMessage, response: ServerResponse, roots: AppRoots) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const target = resolveAppPath(request.url ?? '/', roots);
  if (target === 'ca') {
    const body = Buffer.from(roots.caPem);
    response.writeHead(200, {
      'Content-Type': 'application/x-x509-ca-cert',
      'Content-Length': body.length,
    });
    response.end(request.method === 'HEAD' ? undefined : body);
    return;
  }
  const info = target === null ? null : await stat(target).catch(() => null);
  if (target === null || !info?.isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'Content-Type': CONTENT_TYPE_BY_EXTENSION[extname(target)] ?? 'application/octet-stream',
    'Content-Length': info.size,
    // A sync replaces the manifest under the same name; "Restart sky" must see the new one.
    'Cache-Control': 'no-cache',
  });
  if (request.method === 'HEAD') response.end();
  else await pipeline(createReadStream(target), response);
}
