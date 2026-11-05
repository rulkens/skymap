/**
 * A Layer's `pickCode` that hands out codes from `first` (default 40) in first-ask
 * order: far from every `Source` value a row could still pack by mistake, so a
 * round trip through it fails on any stamp site that skips `pickCode`.
 */
export function fakePickCode(first = 40): (pickSourceId: string) => number {
  const ids: string[] = [];
  return (pickSourceId) => {
    if (!ids.includes(pickSourceId)) ids.push(pickSourceId);
    return first + ids.indexOf(pickSourceId);
  };
}
