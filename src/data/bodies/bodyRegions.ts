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
import { ORBITAL_ELEMENTS } from './orbitalElements';
import { SCENE_ANCHORS } from './sceneAnchors';
import type { BodyRegion } from '../../@types/scene/BodyRegion';
import type { BodyRegionId } from '../../@types/data/BodyRegionId';
import type { OrbitalElements } from '../../@types/scene/OrbitalElements';

const SUN_ID = 'sun';

// Named ahead of its seed: the feature plan adds the anchor and the S-star
// rows, and the walk below claims them without this table being edited.
const SGR_A_STAR_ID = 'sgr-a-star';

// The rate-less J2000 snapshot `foregroundMaxDistance` already reads. Extents
// are set by static star anchors and semi-major axes, so no instant moves them.
const STATES_J2000 = deriveBodyStates(CONST_J2000);

const ELEMENTS_BY_ID = new Map(ORBITAL_ELEMENTS.map((el) => [el.id, el]));

// The anchor an element row ultimately hangs off. `deriveBodyStates` resolves
// the same graph at its module load and throws there on a cycle or a dangling
// focus, so this recursion is known to bottom out by the time it runs.
const focusRootId = (el: OrbitalElements): string => {
  const focus = ELEMENTS_BY_ID.get(el.focusId);
  return focus === undefined ? el.focusId : focusRootId(focus);
};

const orbitalIdsRootedAt = (anchorId: string): readonly string[] =>
  ORBITAL_ELEMENTS.filter((el) => focusRootId(el) === anchorId).map((el) => el.id);

// A body sits in the regime it anchors: an anchor joins its own subtree, so the Sun sits in
// the solar system while merely anchoring the neighbourhood's distances. The filter is
// `galactic-centre`'s alone — its anchor id is authored ahead of the feature plan's seed, so
// until then it is empty and must resolve no position. A dangling FOCUS id throws instead.
const anchoredMemberIds = (anchorId: string): readonly string[] =>
  [anchorId, ...orbitalIdsRootedAt(anchorId)].filter((id) => STATES_J2000.has(id));

const SOLAR_SYSTEM_IDS: readonly string[] = anchoredMemberIds(SUN_ID);

const GALACTIC_CENTRE_IDS: readonly string[] = anchoredMemberIds(SGR_A_STAR_ID);

// Every seeded star anchor no tighter region has claimed. The subtraction must cover EVERY
// anchored region, or a fallen-through anchor inflates the extent the NEAR0 far plane reads.
const CLAIMED_IDS = new Set([...SOLAR_SYSTEM_IDS, ...GALACTIC_CENTRE_IDS]);

const SOLAR_NEIGHBOURHOOD_IDS: readonly string[] = SCENE_ANCHORS.map((anchor) => anchor.id).filter(
  (id) => !CLAIMED_IDS.has(id),
);

// Emptiness is answered BEFORE the anchor is read: a region with no members must
// not resolve an anchor nothing seeds yet, and `Math.max()` over nothing is
// −Infinity.
const maxMemberDistanceMpc = (anchorId: string, memberIds: readonly string[]): number => {
  if (memberIds.length === 0) return 0;
  const anchorPos = STATES_J2000.get(anchorId)!.positionMpc;
  return Math.max(
    ...memberIds.map((id) => distanceMpc(anchorPos, STATES_J2000.get(id)!.positionMpc)),
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
  region('galactic-centre', 'Galactic Centre', SGR_A_STAR_ID, GALACTIC_CENTRE_IDS),
];
