/**
 * satelliteBody — row maker for a MOON: its focus is its parent PLANET's world
 * position, so its world position is the render origin plus the parent's
 * heliocentric offset plus the moon's own offset from the parent — both from
 * `keplerianPositionMpc`, each honouring its row's `plane` (a moon's is its
 * parent's equatorial frame).
 *
 * Every moon parent (Earth, Mars, Jupiter, Saturn) is itself heliocentric, so
 * one parent hop suffices; there is no moon-of-a-moon. This subsumes Earth's
 * Moon too — its parent 'earth' resolves to the same position `SCENE_EARTH`
 * derives.
 *
 * Lives beside `SCENE_PLANETS` in `makers/` rather than in `src/utils/`: it is
 * authoring policy, has a single consumer (the planets table), and maker and
 * table change together.
 */

import { RENDER_ORIGIN_MPC } from '../../renderOrigin';
import { elementsById } from '../orbitalElements';
import { orientationForBody } from '../orientationForBody';
import { keplerianPositionMpc } from '../../../utils/orbit/keplerianPositionMpc';
import { addVec3 } from '../../../utils/math/addVec3';
import type { BodySpec } from '../../../@types/scene/BodySpec';
import type { PlanetBody } from '../../../@types/scene/PlanetBody';

export function satelliteBody(spec: BodySpec): PlanetBody {
  const el = elementsById(spec.id);
  const parentOffset = keplerianPositionMpc(elementsById(el.parentId!));
  const moonOffset = keplerianPositionMpc(el);
  return {
    id: spec.id,
    label: spec.label,
    positionMpc: addVec3(RENDER_ORIGIN_MPC, parentOffset, moonOffset),
    radiusKm: spec.radiusKm,
    albedo: spec.albedo,
    orientation: orientationForBody(spec.id),
  };
}
