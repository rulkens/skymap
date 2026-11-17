import { X509Certificate } from 'node:crypto';
import { DAY_MS } from '../../../../../../src/data/time/dayMs';
import type { LanNames } from '../@types/LanNames';
import { LEAF_RENEW_DAYS } from '../data/leafRenewDays';
import { isSignedByCa } from './isSignedByCa';
import { sanEntries } from './sanEntries';

/** True while the leaf is signed by this CA, names exactly `names` and is not yet due for renewal. */
export function isCurrentLeaf(certPem: string, caPem: string, names: LanNames): boolean {
  if (!isSignedByCa(certPem, caPem)) return false;
  const cert = new X509Certificate(certPem);
  const stored = (cert.subjectAltName ?? '').split(', ').sort();
  const wanted = sanEntries(names).sort();
  const renewAt = Date.parse(cert.validTo) - LEAF_RENEW_DAYS * DAY_MS;
  return stored.join() === wanted.join() && Date.now() < renewAt;
}
