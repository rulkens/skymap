import { X509Certificate } from 'node:crypto';

/** True when the CA's key signed this certificate; false for anything unparsable. */
export function isSignedByCa(certPem: string, caPem: string): boolean {
  try {
    const cert = new X509Certificate(certPem);
    const ca = new X509Certificate(caPem);
    return cert.checkIssued(ca) && cert.verify(ca.publicKey);
  } catch {
    return false;
  }
}
