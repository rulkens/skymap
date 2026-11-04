import { session } from 'electron';
import type { Server } from 'node:https';
import { join } from 'node:path';
import { LAN_CHECK_INTERVAL_MS } from '../certificates/data/lanCheckIntervalMs';
import { currentLanNames } from '../certificates/utils/currentLanNames';
import { isSignedByCa } from '../certificates/utils/isSignedByCa';
import { distDir } from './distDir';
import { ensureLanCertificate } from '../certificates/ensureLanCertificate';
import { renewServerCertificate } from '../certificates/renewServerCertificate';
import { startAppServer } from './startAppServer';

/** The app's HTTPS server on the install's CA, with its certificate kept current as the LAN changes. */
export async function startSecureServer(userData: string, dataRoot: string): Promise<Server> {
  const certDir = join(userData, 'certs');
  let tls = await ensureLanCertificate(certDir, currentLanNames());
  // -3 hands every other chain back to Chromium's own verdict.
  session.defaultSession.setCertificateVerifyProc((request, callback) =>
    callback(isSignedByCa(request.certificate.data, tls.ca) ? 0 : -3),
  );
  const { server } = await startAppServer({ dist: distDir(), data: dataRoot, caPem: tls.ca }, tls);
  // The pairing QR names a live LAN address, so a DHCP change must reach the certificate too.
  const keepCertificateCurrent = (): void => {
    setTimeout(() => {
      renewServerCertificate(server, certDir, currentLanNames(), tls)
        .then((next) => (tls = next))
        .catch((error: unknown) => console.error('certificate renewal:', error))
        .finally(keepCertificateCurrent);
    }, LAN_CHECK_INTERVAL_MS);
  };
  keepCertificateCurrent();
  return server;
}
