import type { Server } from 'node:https';
import type { RelayHandle } from '../../../../tools/@types/remote/RelayHandle.js';
import { attachRemoteRelay } from '../../../../tools/utils/remote/attachRemoteRelay.js';
import type { DesktopRelayOptions } from '../@types/DesktopRelayOptions.js';
import { APP_SERVER_PORT } from '../data/appServerPort.js';
import { isLoopbackRequest } from '../utils/isLoopbackRequest.js';
import { lanOriginFor } from '../utils/lanOriginFor.js';
import { listLanInterfaces } from '../utils/listLanInterfaces.js';

/**
 * The relay's desktop rules: every host gets the stored code (it lasts for weeks, so a host must
 * be on this machine: anyone who can host reads it), and the QR stays off the public sky.
 */
export function attachDesktopRelay(server: Server, opts: DesktopRelayOptions): RelayHandle {
  return attachRemoteRelay(server, {
    codeFor: () => opts.code(),
    mayHost: isLoopbackRequest,
    pairingOnSky: false,
    lanOrigin: () => lanOriginFor(opts.network(), listLanInterfaces(), APP_SERVER_PORT),
  });
}
