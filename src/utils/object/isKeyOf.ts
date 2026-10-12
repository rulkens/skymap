/** Own keys only: `'toString' in registry` is true for every object. */
export function isKeyOf<K extends string>(
  record: Readonly<Record<K, unknown>>,
  key: string,
): key is K {
  return Object.hasOwn(record, key);
}
