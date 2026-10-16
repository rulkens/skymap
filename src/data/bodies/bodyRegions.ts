/**
 * BODY_REGIONS — the scene's scale regimes. Anchor (a position) and extent (a
 * scale) are independent facts, which is why `solar-system` and
 * `solar-neighbourhood` share the Sun and still differ by seven orders of
 * magnitude; not distinguishing the two is what produced a single global
 * `FARTHEST_*` pair keyed on the render origin, unable to express "appears
 * when you are near it". Membership derives from the focus graph and totals
 * `SCENE_BODIES`; extents are `max |member − anchor|`, never authored.
 */

import { deriveBodyStates } from '../../services/engine/frame/deriveBodyStates';
import { distanceMpc } from '../../utils/math/distanceMpc';
import { CONST_J2000 } from '../time/constJ2000';
import { POSITION_DRIVERS, bodyHostId, positionDriverById } from './positionDrivers';
import { SCENE_ANCHORS } from './sceneAnchors';
import { GALACTIC_CENTRE_ANCHOR } from '../places/galacticCentre';
import type { BodyRegion } from '../../@types/scene/BodyRegion';
import type { BodyRegionId } from '../../@types/data/BodyRegionId';
import type { PositionDriver } from '../../@types/scene/PositionDriver';

const SUN_ID = 'sun';

const GALACTIC_CENTRE_ID = GALACTIC_CENTRE_ANCHOR.id;

// The rate-less J2000 snapshot `foregroundMaxDistance` already reads. Extents
// are set by static star anchors and semi-major axes, so no instant moves them.
const STATES_J2000 = deriveBodyStates(CONST_J2000);

// The anchor a body ultimately hangs off, walking `bodyHostId` (orbit focus or site host).
// `deriveBodyStates` resolves the same graph at its module load and throws there on a cycle
// or a dangling focus, so this recursion is known to bottom out by the time it runs.
const rootIdOf = (id: string): string => {
  const host = bodyHostId(id);
  return host === null ? id : rootIdOf(host);
};

// A body sits in the regime it anchors: an anchor joins its own subtree, so the Sun sits in
// the solar system while merely anchoring the neighbourhood's distances. A landing site
// joins the region its HOST sits in — a rover is in the solar system by being on Mars.
// Members are filtered to ids the snapshot holds, so an anchor seeded ahead of its rows reads
// as an empty region rather than resolving a position that does not exist.
const anchoredMemberIds = (anchorId: string): readonly string[] =>
  POSITION_DRIVERS.filter((driver) => rootIdOf(driver.id) === anchorId)
    .map((driver) => driver.id)
    .filter((id) => STATES_J2000.has(id));

const SOLAR_SYSTEM_IDS: readonly string[] = anchoredMemberIds(SUN_ID);

const GALACTIC_CENTRE_IDS: readonly string[] = anchoredMemberIds(GALACTIC_CENTRE_ID);

// Every seeded star anchor no tighter region has claimed. The subtraction must cover EVERY
// anchored region, or a fallen-through anchor inflates the extent the NEAR0 far plane reads.
const CLAIMED_IDS = new Set([...SOLAR_SYSTEM_IDS, ...GALACTIC_CENTRE_IDS]);

const SOLAR_NEIGHBOURHOOD_IDS: readonly string[] = SCENE_ANCHORS.map((anchor) => anchor.id).filter(
  (id) => !CLAIMED_IDS.has(id),
);

// An escaping craft has no envelope: Voyager 1 recedes ~3.6 au/yr against Pluto's
// 30, so a snapshot max over a sampled row measures the clock rather than the
// region, and `scaleFadeBands` sizes its glint backdrop off this. Such rows stay
// MEMBERS; only the max drops them.
const isUnbound = (driver: PositionDriver): boolean => driver.kind === 'sampled';

// Emptiness is answered BEFORE the anchor is read: a region with no members must
// not resolve an anchor nothing seeds yet, and `Math.max()` over nothing is
// −Infinity.
const maxMemberDistanceMpc = (anchorId: string, memberIds: readonly string[]): number => {
  const bounding = memberIds.filter((id) => !isUnbound(positionDriverById(id)));
  if (bounding.length === 0) return 0;
  const anchorPos = STATES_J2000.get(anchorId)!.positionMpc;
  return Math.max(
    ...bounding.map((id) => distanceMpc(anchorPos, STATES_J2000.get(id)!.positionMpc)),
  );
};

const region = (
  id: BodyRegionId,
  label: string,
  anchorId: string,
  memberIds: readonly string[],
): BodyRegion => ({
  id,
  label,
  anchorId,
  memberIds,
  extentMpc: maxMemberDistanceMpc(anchorId, memberIds),
});

export const BODY_REGIONS: readonly BodyRegion[] = [
  region('solar-system', 'Solar System', SUN_ID, SOLAR_SYSTEM_IDS),
  region('solar-neighbourhood', 'Solar Neighbourhood', SUN_ID, SOLAR_NEIGHBOURHOOD_IDS),
  region('galactic-centre', 'Galactic Centre', GALACTIC_CENTRE_ID, GALACTIC_CENTRE_IDS),
];
