import type { Server } from 'node:https';
import type { RelayHandle } from '../../../../tools/@types/remote/RelayHandle';
import { attachRemoteRelay } from '../../../../tools/utils/remote/attachRemoteRelay';
import type { DesktopRelayOptions } from '../@types/DesktopRelayOptions';
import { APP_ORIGIN } from '../data/appOrigin';
import { APP_SERVER_PORT } from '../data/appServerPort';
import { isLoopbackRequest } from '../utils/isLoopbackRequest';
import { lanOriginFor } from '../utils/lanOriginFor';
import { listLanInterfaces } from '../utils/listLanInterfaces';

// The relay's own prefix (tools/utils/remote/attachRemoteRelay.ts); it ignores every other upgrade.
const RELAY_PATH_PREFIX = '/__remote/';

/**
 * The relay's desktop rules: every host gets the stored code, and it lasts for weeks, so only the
 * app's own sky window may host (anyone who can host reads it); the QR stays off the public sky.
 */
export function attachDesktopRelay(server: Server, opts: DesktopRelayOptions): RelayHandle {
  const relay = attachRemoteRelay(server, {
    codeFor: () => opts.code(),
    // Loopback alone would admit any local browser tab; the Origin header names the page itself.
    mayHost: (request) => isLoopbackRequest(request) && request.headers.origin === APP_ORIGIN,
    pairingOnSky: false,
    lanOrigin: () => lanOriginFor(opts.network(), listLanInterfaces(), APP_SERVER_PORT),
  });
  // Once anyone listens for upgrades Node stops closing them, so an unclaimed one would leak.
  server.on('upgrade', (request, socket) => {
    if (!(request.url ?? '').startsWith(RELAY_PATH_PREFIX)) socket.destroy();
  });
  return relay;
}
