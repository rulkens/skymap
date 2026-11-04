import { createPrivateKey, X509Certificate } from 'node:crypto';
import type { PemPair } from '../@types/PemPair.js';

/** True when both parse and the key is the certificate's own; false for anything corrupt. */
export function keyMatchesCert(pair: PemPair): boolean {
  try {
    return new X509Certificate(pair.cert).checkPrivateKey(createPrivateKey(pair.key));
  } catch {
    return false;
  }
}
