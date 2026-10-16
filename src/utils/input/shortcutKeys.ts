/** A shortcut's `keys` as single keys; a comma that ends the string (or stands alone) is the key itself. */
export function shortcutKeys(keys: string): string[] {
  return keys.split(/,(?=.)/);
}
