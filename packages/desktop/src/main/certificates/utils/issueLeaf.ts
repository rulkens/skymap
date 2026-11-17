import { generate } from 'selfsigned';
import type { LanNames } from '../@types/LanNames';
import type { PemPair } from '../@types/PemPair';
import { LEAF_DAYS } from '../data/leafDays';
import { validFor } from './validFor';

/** A server leaf signed by `ca`, valid for the machine's host names and LAN addresses. */
export async function issueLeaf(ca: PemPair, names: LanNames): Promise<PemPair> {
  const pems = await generate([{ name: 'commonName', value: 'localhost' }], {
    ...validFor(LEAF_DAYS),
    keyType: 'ec',
    algorithm: 'sha256',
    ca,
    extensions: [
      { name: 'basicConstraints', cA: false, critical: true },
      { name: 'keyUsage', digitalSignature: true, critical: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [
          ...names.hostnames.map((value) => ({ type: 2 as const, value })),
          ...names.ips.map((ip) => ({ type: 7 as const, ip })),
        ],
      },
    ],
  });
  return { key: pems.private, cert: pems.cert };
}
