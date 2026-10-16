/** Puts `item` first in `list`, so the newest registration is asked first; returns the way to take it out again. */
export function register<T>(list: T[], item: T): () => void {
  list.unshift(item);
  return () => {
    const at = list.indexOf(item);
    if (at >= 0) list.splice(at, 1);
  };
}
