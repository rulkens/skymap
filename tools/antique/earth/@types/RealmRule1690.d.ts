/** One Natural Earth admin-1 → 1690 assignment (`REALM_RULES_1690`, first match
 * wins). `target` is a realm or province key; null leaves the land unclaimed. */
export type RealmRule1690 =
  | {
      readonly match: 'adm0' | 'unit' | 'geonunit';
      /** adm0_a3, iso_3166_2 or geonunit values. */
      readonly codes: readonly string[];
      readonly target: string | null;
    }
  | {
      /** A unit of `adm0` whose interior point falls inside `ring` (lon/lat degrees). */
      readonly match: 'centroid';
      readonly adm0: string;
      readonly ring: readonly (readonly [number, number])[];
      readonly target: string | null;
    };
