/**
 * ZoneOfAvoidanceInfo — the zone-of-avoidance guide band as a resolved
 * focusable target, parallel to `MilkyWayInfo`. Like the Milky Way it has
 * exactly one instance, so its info is a single static const (see
 * `data/zoneOfAvoidance/zoneOfAvoidanceInfo.ts`) rather than a per-row
 * derivation.
 *
 * Unlike every other FocusableTarget arm, this one carries no `x`/`y`/`z`: the
 * band is a line-of-sight extinction effect along the whole galactic plane,
 * not a point with a "there" — so there is no Focus/fly-here target for it
 * (the InfoCard never wires `CardHeader`'s `onFocus` for this arm).
 */
export type ZoneOfAvoidanceInfo = {
  /** Union tag — mirrors the SOURCE_REGISTRY 'zoneOfAvoidance' row type; what
   *  every FocusableTarget table / guard keys on. */
  readonly type: 'zoneOfAvoidance';
  /** Headline shown in the InfoCard / palette row. */
  readonly displayName: string;
  /** Explicit Wikipedia article title, e.g. 'Zone_of_Avoidance'. */
  readonly wikiTitle: string;
  /** Didactic blurb: dust extinction, why surveys are blind here. */
  readonly description: string;
};
