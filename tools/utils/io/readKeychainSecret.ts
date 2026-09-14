/**
 * readKeychainSecret — read a login-keychain generic password by service
 * name, the same `security find-generic-password -a $USER -s <service> -w`
 * call `tools/deploy/syncR2Secure.sh` uses. `execFileSync` (never a shell
 * string) so the service name can't be reinterpreted by a shell.
 */
import { execFileSync } from 'node:child_process';

export function readKeychainSecret(service: string): string {
  const user = process.env['USER'];
  if (!user) throw new Error('readKeychainSecret: $USER is not set');

  try {
    const raw = execFileSync(
      'security',
      ['find-generic-password', '-a', user, '-s', service, '-w'],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return raw.toString('utf8').replace(/\n$/, '');
  } catch {
    throw new Error(
      `readKeychainSecret: no login-keychain entry for service "${service}". ` +
        `Add one with: security add-generic-password -a "$USER" -s ${service} -w <value>`,
    );
  }
}
