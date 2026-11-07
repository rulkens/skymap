import type { Server } from 'node:https';
import type { LanCertificate } from './@types/LanCertificate';
import type { LanNames } from './@types/LanNames';
import type { PemPair } from './@types/PemPair';
import { ensureLeaf } from './ensureLeaf';

/** Swaps the live server onto a reissued leaf when `names` changed; open connections keep theirs. */
export async function renewServerCertificate(
  server: Server,
  certDir: string,
  ca: PemPair,
  names: LanNames,
  current: LanCertificate,
): Promise<LanCertificate> {
  const next = await ensureLeaf(certDir, ca, names);
  if (next.cert !== current.cert) server.setSecureContext({ key: next.key, cert: next.cert });
  return next;
}
