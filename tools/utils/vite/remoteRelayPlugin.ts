/** Vite plugin: hosts the remote relay and the origins list on the dev and preview servers. */
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite';
import { attachRemoteRelay, REMOTE_PATH_PREFIX } from './attachRemoteRelay.ts';
import { listRemoteOrigins } from './listRemoteOrigins.ts';

function wire(server: ViteDevServer | PreviewServer): void {
  const http = server.httpServer as Server | null;
  if (http === null) return;
  attachRemoteRelay(http);
  const port = (): number => (http.address() as AddressInfo).port;
  const origins: Connect.NextHandleFunction = (_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(listRemoteOrigins(port())));
  };
  server.middlewares.use(`${REMOTE_PATH_PREFIX}origins`, origins);
  http.once('listening', () => {
    const [first] = listRemoteOrigins(port());
    server.config.logger.info(`  ➜  Remote:  ${first}/remote.html`);
  });
}

export function remoteRelayPlugin(): Plugin {
  return {
    name: 'skymap:remote-relay',
    configureServer: wire,
    configurePreviewServer: wire,
  };
}
