/** Keeps a value for this tab, so an edit-triggered reload of the dev page does not lose it. */
export function remember(key: string, value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* private window: nothing survives a reload */
  }
}
