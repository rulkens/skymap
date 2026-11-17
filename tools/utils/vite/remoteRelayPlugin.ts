/** Vite plugin: hosts the remote relay on the dev and preview servers. */
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { CommonServerOptions, Plugin, PreviewServer, ViteDevServer } from 'vite';
import { newLocalRoomCode } from '../../../src/utils/remote/newLocalRoomCode';
import { attachRemoteRelay } from '../remote/attachRemoteRelay.ts';
import { listRemoteOrigins } from '../remote/listRemoteOrigins.ts';

function wire(server: ViteDevServer | PreviewServer, options: CommonServerOptions): void {
  const http = server.httpServer as Server | null;
  if (http === null) return;
  // Vite binds localhost alone unless `host` is set (`--host`), as its own printUrls reads it.
  const exposed =
    options.host !== undefined && options.host !== false && options.host !== 'localhost';
  // Never empty: localhost is always last.
  const firstOrigin = (): string =>
    listRemoteOrigins((http.address() as AddressInfo).port, exposed, Boolean(options.https))[0]!;
  attachRemoteRelay(http, {
    codeFor: (last) => last ?? newLocalRoomCode(),
    lanOrigin: firstOrigin,
    mayHost: () => true,
    pairingOnSky: true,
  });
  const printUrls = server.printUrls.bind(server);
  server.printUrls = () => {
    printUrls();
    server.config.logger.info(`  ➜  Remote:  ${firstOrigin()}/remote.html`);
  };
}

export function remoteRelayPlugin(): Plugin {
  return {
    name: 'skymap:remote-relay',
    configureServer: (server) => wire(server, server.config.server),
    configurePreviewServer: (server) => wire(server, server.config.preview),
  };
}
