import { session } from 'electron';
import { join } from 'node:path';
import type { SecureServer } from './@types/SecureServer';
import { currentLanNames } from '../certificates/utils/currentLanNames';
import { isSignedByCa } from '../certificates/utils/isSignedByCa';
import { distDir } from './distDir';
import { ensureCa } from '../certificates/ensureCa';
import { ensureLeaf } from '../certificates/ensureLeaf';
import { renewServerCertificate } from '../certificates/renewServerCertificate';
import { startAppServer } from './startAppServer';

/**
 * The app's HTTPS server on the install's CA; `renewCertificate` follows a LAN change. The app's
 * pages may ask the browser for nothing (camera, notifications, …): the kiosk grants no permission.
 */
export async function startSecureServer(userData: string, dataRoot: string): Promise<SecureServer> {
  const certDir = join(userData, 'certs');
  const ca = await ensureCa(certDir);
  let tls = await ensureLeaf(certDir, ca, currentLanNames());
  // -3 hands every other chain back to Chromium's own verdict.
  session.defaultSession.setCertificateVerifyProc((request, callback) =>
    callback(isSignedByCa(request.certificate.data, ca.cert) ? 0 : -3),
  );
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, grant) =>
    grant(false),
  );
  const { server } = await startAppServer({ dist: distDir(), data: dataRoot, caPem: ca.cert }, tls);
  const renewCertificate = async (): Promise<void> => {
    tls = await renewServerCertificate(server, certDir, ca, currentLanNames(), tls);
  };
  return { server, renewCertificate };
}
