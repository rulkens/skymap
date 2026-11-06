import type { SplitVisibilityAddress } from '../../@types/animation/SplitVisibilityAddress';

/** The one reading of the address grammar, shared by the cue writer and the link parser. No show
 * key, label name or item id holds a ':', so the parts are unambiguous. */
export function splitVisibilityAddress(address: string): SplitVisibilityAddress {
  const [head = '', second, third] = address.split(':');
  return head === 'label' ? { bare: `label:${second}`, item: third } : { bare: head, item: second };
}
