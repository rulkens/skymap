import type { LanInterface } from '../../../@types/LanInterface';

/** https://<picked or first interface address>:port; https://localhost:port when there is none. */
export function lanOriginFor(
  network: string | null,
  interfaces: readonly LanInterface[],
  port: number,
): string {
  const lan = interfaces.find((i) => i.name === network) ?? interfaces[0];
  return `https://${lan?.address ?? 'localhost'}:${port}`;
}
