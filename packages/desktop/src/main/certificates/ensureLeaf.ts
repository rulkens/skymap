import { join } from 'node:path';
import type { LanCertificate } from './@types/LanCertificate';
import type { LanNames } from './@types/LanNames';
import type { PemPair } from './@types/PemPair';
import { isCurrentLeaf } from './utils/isCurrentLeaf';
import { issueLeaf } from './utils/issueLeaf';
import { keyMatchesCert } from './utils/keyMatchesCert';
import { readJsonFile } from '../files/utils/readJsonFile';
import { writeFileAtomically } from '../files/utils/writeFileAtomically';

/** The server's leaf, `certDir/leaf.json`, reissued under `ca` when the names change or it nears expiry. */
export async function ensureLeaf(
  certDir: string,
  ca: PemPair,
  names: LanNames,
): Promise<LanCertificate> {
  const path = join(certDir, 'leaf.json');
  let leaf = await readJsonFile<PemPair>(path);
  if (leaf === null || !keyMatchesCert(leaf) || !isCurrentLeaf(leaf.cert, ca.cert, names)) {
    leaf = await issueLeaf(ca, names);
    await writeFileAtomically(path, JSON.stringify(leaf));
  }
  return { key: leaf.key, cert: leaf.cert, ca: ca.cert };
}
