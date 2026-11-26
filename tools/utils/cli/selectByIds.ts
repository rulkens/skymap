/** The rows a tool's command-line ids name (all of them when none is given); an unknown id throws. */
export function selectByIds<T extends { id: string }>(
  rows: readonly T[],
  ids: readonly string[],
): readonly T[] {
  const unknown = ids.find((id) => !rows.some((row) => row.id === id));
  if (unknown !== undefined)
    throw new Error(`unknown id "${unknown}"; valid ids: ${rows.map((row) => row.id).join(', ')}`);
  return ids.length === 0 ? rows : rows.filter((row) => ids.includes(row.id));
}
