import type { LayerSwitch } from '../../@types/url/LayerSwitch';

/** Switches as a `layers=` value, `parseLayerSwitches`' inverse; `''` for none. No token holds
 * a `,`, so the join needs no escaping. */
export function encodeLayerSwitches(switches: readonly LayerSwitch[]): string {
  return switches.map(({ address, on }) => (on ? address : `-${address}`)).join(',');
}
