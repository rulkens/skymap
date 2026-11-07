/**
 * newsGate — a stateful gate that passes a value only when `changed` calls it news against the
 * last value it passed, so a per-frame readout row dispatches nothing while its value holds.
 * It compares against its own last pass, never the store: the store dedups on write as well.
 */
export function newsGate<T>(
  changed: (prev: T, next: T) => boolean,
  initial: T,
): (next: T) => boolean {
  let passed = initial;
  return (next) => {
    if (!changed(passed, next)) return false;
    passed = next;
    return true;
  };
}
