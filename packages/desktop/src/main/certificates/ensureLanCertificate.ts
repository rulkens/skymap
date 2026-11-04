/**
 * The install's CA and the server's leaf certificate, kept in `certDir`. Tablets trust the CA once
 * (via /ca.crt), so it is made once per install and kept while it and its key are sound; the leaf
 * is reissued when the machine's names change or it nears expiry, which never breaks that trust.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { LanCertificate } from './@types/LanCertificate';
import type { LanNames } from './@types/LanNames';
import type { PemPair } from './@types/PemPair';
import { isCurrentLeaf } from './utils/isCurrentLeaf';
import { isSignedByCa } from './utils/isSignedByCa';
import { issueCa } from './utils/issueCa';
import { issueLeaf } from './utils/issueLeaf';
import { keyMatchesCert } from './utils/keyMatchesCert';
import { readJsonFile } from '../files/utils/readJsonFile';
import { writeFileAtomically } from '../files/utils/writeFileAtomically';

export async function ensureLanCertificate(
  certDir: string,
  names: LanNames,
): Promise<LanCertificate> {
  await mkdir(certDir, { recursive: true });
  const caPath = join(certDir, 'ca.json');
  const leafPath = join(certDir, 'leaf.json');
  let ca = await readJsonFile<PemPair>(caPath);
  // A corrupt CA means a new one: tablets trust it again once, rather than the app never starting.
  if (ca === null || !keyMatchesCert(ca) || !isSignedByCa(ca.cert, ca.cert)) {
    ca = await issueCa();
    await writeFileAtomically(caPath, JSON.stringify(ca));
  }
  let leaf = await readJsonFile<PemPair>(leafPath);
  if (leaf === null || !keyMatchesCert(leaf) || !isCurrentLeaf(leaf.cert, ca.cert, names)) {
    leaf = await issueLeaf(ca, names);
    await writeFileAtomically(leafPath, JSON.stringify(leaf));
  }
  return { key: leaf.key, cert: leaf.cert, ca: ca.cert };
}
