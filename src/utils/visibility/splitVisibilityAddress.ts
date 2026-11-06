/** A visibility address's bare part (`flow`, `label:structure`) and its scoped item, if any:
 * the one reading of the address grammar, shared by the cue writer and the link parser. No show
 * key, label name or item id holds a ':', so the parts are unambiguous. */
export function splitVisibilityAddress(address: string): {
  readonly bare: string;
  readonly item: string | undefined;
} {
  const [head = '', second, third] = address.split(':');
  return head === 'label' ? { bare: `label:${second}`, item: third } : { bare: head, item: second };
}
