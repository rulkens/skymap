/**
 * MilkyWayInfo — the Milky Way as a resolved focusable target, parallel to
 * `GalaxyInfo` and `StructureInfo`.  All three are arms of the FocusableTarget
 * union and flow through the same hover / select / focus slots; every table and
 * type-guard keys on the `type` discriminant.
 *
 * Unlike the galaxy/structure arms, the Milky Way has exactly one instance, so
 * its info is a single static const (see `data/milkyWay/milkyWayInfo.ts`) rather
 * than a per-row derivation.  We're inside this galaxy, so the usual catalog
 * notion of "distance to it" is undefined — the card carries a `distanceNote`
 * instead, and the world coords are the galactic centre (Sgr A*).
 *
 * Note the morphology lives in `typeString`, NOT `type`: `type` is reserved for
 * the union discriminant, so the Hubble-class string can't share that name the
 * way it does on `GalaxyInfo.famous.type` (which isn't the union tag).
 */
export type MilkyWayInfo = {
  /** Union tag — mirrors the SOURCE_REGISTRY 'milkyWay' row type; what every
   *  FocusableTarget table / guard keys on. */
  readonly type: 'milkyWay';
  /** Headline shown in the InfoCard / palette row. */
  readonly displayName: string;
  /** One-line blurb for the card. */
  readonly description: string;
  /** Morphological type for the card's type row. */
  readonly typeString: string;
  /** Distance note for the card (we are inside it; ~8 kpc to the centre). */
  readonly distanceNote: string;
  /** World-space position of the galactic centre (Sgr A*), from MILKY_WAY_CENTER_WORLD. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
};
