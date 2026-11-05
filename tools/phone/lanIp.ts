import { execFileSync } from 'node:child_process';

/** The Mac's WiFi address, the host the phone reaches the server on (macOS only). */
export function lanIp(): string {
  let ip = '';
  try {
    ip = execFileSync('ipconfig', ['getifaddr', 'en0'], { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    // ipconfig exits 1 when en0 has no address; reported below.
  }
  if (ip === '') throw new Error('no LAN address on en0 — is WiFi connected?');
  return ip;
}
