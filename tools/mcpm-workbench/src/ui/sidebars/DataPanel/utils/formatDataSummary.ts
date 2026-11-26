/** formatDataSummary — how many built-in catalogs are on, and whether the loaded file is. */
export function formatDataSummary(builtInCount: number, userCatalogOn: boolean): string {
  if (builtInCount === 0) return userCatalogOn ? 'yours' : 'none';
  const builtIns = `${builtInCount} ${builtInCount === 1 ? 'catalog' : 'catalogs'}`;
  return userCatalogOn ? `${builtIns} + yours` : builtIns;
}
