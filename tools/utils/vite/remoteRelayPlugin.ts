/** Vite plugin: hosts the remote relay and the origins list on the dev and preview servers. */
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { CommonServerOptions, Connect, Plugin, PreviewServer, ViteDevServer } from 'vite';
import { attachRemoteRelay, REMOTE_PATH_PREFIX } from './attachRemoteRelay.ts';
import { listRemoteOrigins } from './listRemoteOrigins.ts';

function wire(server: ViteDevServer | PreviewServer, options: CommonServerOptions): void {
  const http = server.httpServer as Server | null;
  if (http === null) return;
  attachRemoteRelay(http);
  // Vite binds localhost alone unless `host` is set (`--host`), as its own printUrls reads it.
  const exposed =
    options.host !== undefined && options.host !== false && options.host !== 'localhost';
  const origins = (): string[] =>
    listRemoteOrigins((http.address() as AddressInfo).port, exposed, Boolean(options.https));
  const serveOrigins: Connect.NextHandleFunction = (_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(origins()));
  };
  server.middlewares.use(`${REMOTE_PATH_PREFIX}origins`, serveOrigins);
  const printUrls = server.printUrls.bind(server);
  server.printUrls = () => {
    printUrls();
    server.config.logger.info(`  ➜  Remote:  ${origins()[0]}/remote.html`);
  };
}

export function remoteRelayPlugin(): Plugin {
  return {
    name: 'skymap:remote-relay',
    configureServer: (server) => wire(server, server.config.server),
    configurePreviewServer: (server) => wire(server, server.config.preview),
  };
}
