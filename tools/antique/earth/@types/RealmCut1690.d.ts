/** A historical line through modern admin-1 units (`REALM_CUTS_1690`): the part
 * of each listed unit inside the shape goes to `target` (null: unclaimed). The
 * shape is a hand-drawn ring or the union of pinned OpenHistoricalMap relations. */
export type RealmCut1690 = {
  readonly units: readonly string[];
  readonly target: string | null;
} & (
  | { readonly ring: readonly (readonly [number, number])[] }
  | { readonly ohmRelations: readonly number[] }
);
