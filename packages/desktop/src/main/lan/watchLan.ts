import type { LanInterface } from '../../@types/LanInterface';
import { LAN_CHECK_INTERVAL_MS } from './data/lanCheckIntervalMs';

/**
 * Re-reads the LAN every LAN_CHECK_INTERVAL_MS and calls `onChange` when it differs, so a kiosk that
 * booted before the network (a switch slower than the PC after a power cut) still gets an address.
 */
export function watchLan(
  list: () => LanInterface[],
  onChange: (interfaces: LanInterface[]) => void,
): void {
  let last = JSON.stringify(list());
  setInterval(() => {
    const interfaces = list();
    const key = JSON.stringify(interfaces);
    if (key === last) return;
    last = key;
    onChange(interfaces);
  }, LAN_CHECK_INTERVAL_MS);
}
