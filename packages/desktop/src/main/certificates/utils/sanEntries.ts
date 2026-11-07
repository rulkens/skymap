import type { LanNames } from '../@types/LanNames';

/** The subject alternative names for `names`, in the form X509Certificate.subjectAltName prints them. */
export function sanEntries(names: LanNames): string[] {
  return [...names.hostnames.map((h) => `DNS:${h}`), ...names.ips.map((ip) => `IP Address:${ip}`)];
}
