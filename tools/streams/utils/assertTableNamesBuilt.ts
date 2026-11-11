/**
 * Throws when a curated per-stream table keys a name the build does not draw: a galstreams rename
 * on refetch would otherwise drop that stream's row unseen.
 */
export function assertTableNamesBuilt(
  what: string,
  table: Readonly<Record<string, unknown>>,
  built: ReadonlySet<string>,
): void {
  const stale = Object.keys(table).filter((name) => !built.has(name));
  if (stale.length > 0) {
    throw new Error(`buildStellarStreams: ${what} rows name no built stream: ${stale.join(', ')}`);
  }
}
