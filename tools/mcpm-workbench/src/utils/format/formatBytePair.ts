/**
 * formatBytePair — "used / max" in the max's unit, binary like formatBytes, so
 * the two numbers compare at a glance.
 */
export function formatBytePair(usedBytes: number, maxBytes: number): string {
  if (maxBytes >= 1024 ** 3) {
    return `${(usedBytes / 1024 ** 3).toFixed(1)} / ${(maxBytes / 1024 ** 3).toFixed(1)} GB`;
  }
  return `${(usedBytes / 1024 ** 2).toFixed(0)} / ${(maxBytes / 1024 ** 2).toFixed(0)} MB`;
}
