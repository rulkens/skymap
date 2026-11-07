import { randomBytes } from 'node:crypto';
import { generate } from 'selfsigned';
import type { PemPair } from '../@types/PemPair';
import { CA_DAYS } from '../data/caDays';
import { validFor } from './validFor';

/** A new install CA that may sign leaves but no further CAs. */
export async function issueCa(): Promise<PemPair> {
  // A per-install suffix tells two installs' CAs apart on a tablet that trusts both.
  const commonName = `Skymap local CA ${randomBytes(4).toString('hex')}`;
  const pems = await generate([{ name: 'commonName', value: commonName }], {
    ...validFor(CA_DAYS),
    keyType: 'ec',
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: true, pathLenConstraint: 0, critical: true },
      { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    ],
  });
  return { key: pems.private, cert: pems.cert };
}
