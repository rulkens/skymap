/** meshBodySlotKey — the single home for the `mesh:` prefix on a mesh body's
 *  `AssetWiringRow.key`. */
export function meshBodySlotKey(id: string): `mesh:${string}` {
  return `mesh:${id}`;
}
