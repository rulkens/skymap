/** A layer address as a row name: `flow`, `clusters labels` for `label:clusters`, the bare item for a scoped address. */
export function formatAddress(address: string): string {
  const parts = address.split(':');
  if (parts[0] === 'label') return parts[2] ?? `${parts[1]} labels`;
  return parts[1] ?? address;
}
