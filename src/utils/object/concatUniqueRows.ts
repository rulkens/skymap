/**
 * concatUniqueRows — concatenate row lists, throwing on a duplicate key. The
 * composition tables resolve a key to its FIRST row, so a duplicate would
 * silently shadow its twin instead of failing at boot.
 */

export function concatUniqueRows<Row>(
  table: string,
  keyOf: (row: Row) => string,
  lists: readonly (readonly Row[])[],
): readonly Row[] {
  const rows = lists.flat();
  const seen = new Set<string>();
  for (const row of rows) {
    const key = keyOf(row);
    if (seen.has(key)) throw new Error(`${table}: two rows share the key '${key}'`);
    seen.add(key);
  }
  return rows;
}
