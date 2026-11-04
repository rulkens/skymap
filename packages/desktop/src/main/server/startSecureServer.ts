import { session } from 'electron';
import { join } from 'node:path';
import type { SecureServer } from './@types/SecureServer';
import { currentLanNames } from '../certificates/utils/currentLanNames';
import { isSignedByCa } from '../certificates/utils/isSignedByCa';
import { distDir } from './distDir';
import { ensureLanCertificate } from '../certificates/ensureLanCertificate';
import { renewServerCertificate } from '../certificates/renewServerCertificate';
import { startAppServer } from './startAppServer';

/** The app's HTTPS server on the install's CA; `renewCertificate` follows a LAN change. */
export async function startSecureServer(userData: string, dataRoot: string): Promise<SecureServer> {
  const certDir = join(userData, 'certs');
  let tls = await ensureLanCertificate(certDir, currentLanNames());
  // -3 hands every other chain back to Chromium's own verdict.
  session.defaultSession.setCertificateVerifyProc((request, callback) =>
    callback(isSignedByCa(request.certificate.data, tls.ca) ? 0 : -3),
  );
  const { server } = await startAppServer({ dist: distDir(), data: dataRoot, caPem: tls.ca }, tls);
  const renewCertificate = async (): Promise<void> => {
    tls = await renewServerCertificate(server, certDir, currentLanNames(), tls);
  };
  return { server, renewCertificate };
}
