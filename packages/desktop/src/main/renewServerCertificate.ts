import type { Server } from 'node:https';
import type { LanCertificate } from '../@types/LanCertificate.js';
import type { LanNames } from '../@types/LanNames.js';
import { ensureLanCertificate } from './ensureLanCertificate.js';

/** Swaps the live server onto a reissued leaf when `names` changed; open connections keep theirs. */
export async function renewServerCertificate(
  server: Server,
  certDir: string,
  names: LanNames,
  current: LanCertificate,
): Promise<LanCertificate> {
  const next = await ensureLanCertificate(certDir, names);
  if (next.cert !== current.cert) server.setSecureContext({ key: next.key, cert: next.cert });
  return next;
}
