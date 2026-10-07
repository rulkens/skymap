import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CertPair } from '../../@types/serve/CertPair';

/**
 * The mkcert pair in `certDir` (`<name>.pem` + `<name>-key.pem`), or undefined
 * when the gitignored directory holds none. Generate one with
 * `mkdir -p .certs && cd .certs && mkcert localhost <lan-ip>`.
 */
export function readCertPair(certDir: string): CertPair | undefined {
  const files = existsSync(certDir) ? readdirSync(certDir) : [];
  const keyFile = files.find((f) => f.endsWith('-key.pem'));
  const certFile = files.find((f) => f.endsWith('.pem') && !f.endsWith('-key.pem'));
  if (!keyFile || !certFile) return undefined;
  return {
    cert: readFileSync(join(certDir, certFile)),
    key: readFileSync(join(certDir, keyFile)),
  };
}
