import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CertPair } from '../@types/serve/CertPair';

/**
 * The mkcert pair for `ip` in `certDir`, minted when missing. mkcert names a
 * two-host cert `<first-host>+1.pem`. The phone does not trust the mkcert CA;
 * that is fine, since every tab the tool opens ignores certificate errors.
 */
export function ensureLanCert(certDir: string, ip: string): CertPair {
  const cert = join(certDir, `${ip}+1.pem`);
  const key = join(certDir, `${ip}+1-key.pem`);
  if (!existsSync(cert) || !existsSync(key)) {
    mkdirSync(certDir, { recursive: true });
    console.error(`phone: minting a cert for ${ip} in ${certDir}`);
    execFileSync('mkcert', [ip, 'localhost'], { cwd: certDir, stdio: 'inherit' });
  }
  return { cert: readFileSync(cert), key: readFileSync(key) };
}
