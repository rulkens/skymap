/** One element of the OpenHistoricalMap Overpass extract (`ohm.relations-1690`):
 * a pinned relation (members by reference) or one of its ways (with geometry). */
export type OhmElement =
  | {
      readonly type: 'relation';
      readonly id: number;
      readonly version: number;
      readonly tags?: Readonly<Record<string, string>>;
      readonly members: readonly { readonly type: string; readonly ref: number; readonly role: string }[];
    }
  | {
      readonly type: 'way';
      readonly id: number;
      readonly version: number;
      readonly tags?: Readonly<Record<string, string>>;
      readonly geometry: readonly { readonly lat: number; readonly lon: number }[];
    };
