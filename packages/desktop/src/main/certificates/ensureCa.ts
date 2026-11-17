import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { PemPair } from './@types/PemPair';
import { isSignedByCa } from './utils/isSignedByCa';
import { issueCa } from './utils/issueCa';
import { keyMatchesCert } from './utils/keyMatchesCert';
import { readJsonFile } from '../files/utils/readJsonFile';
import { writeFileAtomically } from '../files/utils/writeFileAtomically';

/**
 * The install's CA, `certDir/ca.json`: made once and kept while it and its key are sound, because
 * tablets trust it once (via /ca.crt). Read once per launch, so /ca.crt and the leaf always agree.
 */
export async function ensureCa(certDir: string): Promise<PemPair> {
  await mkdir(certDir, { recursive: true });
  const path = join(certDir, 'ca.json');
  const stored = await readJsonFile<PemPair>(path);
  if (stored !== null && keyMatchesCert(stored) && isSignedByCa(stored.cert, stored.cert)) {
    return stored;
  }
  // A corrupt CA means a new one: tablets trust it again once, rather than the app never starting.
  const ca = await issueCa();
  await writeFileAtomically(path, JSON.stringify(ca));
  return ca;
}
