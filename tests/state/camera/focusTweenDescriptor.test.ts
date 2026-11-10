import { describe, it, expect } from 'vitest';

import { focusTweenDescriptor } from '../../../src/state/camera/focusTweenDescriptor';
import { arrivalFraming } from '../../../src/services/engine/camera/framing/arrivalFraming';
import { selectionKindOf } from '../../../src/services/engine/selection/selectionKindOf';
import { MILKY_WAY_CENTER_WORLD } from '../../../src/data/milkyWay/galacticCenter';
import { makeGalaxyRow } from '../../fixtures/makeGalaxyRow';
import type { CameraPose } from '../../../src/@types/camera/pose/CameraPose';
import type { FocusMotion } from '../../../src/@types/camera/focusMotion/FocusMotion';
import type { GalaxyRow } from '../../../src/layers/galaxyCatalog/records/@types/GalaxyRow';
import type { StructureInfo } from '../../../src/@types/data/structure/StructureInfo';
import { MILKY_WAY_ROW } from '../../fixtures/milkyWayRow';
import { placedStructureRow } from '../../../src/layers/structure/selection/utils/placedStructureRow';
import { installAppSelectionKinds } from '../../support/installAppSelectionKinds';

installAppSelectionKinds();

// A representative live pose to seed `from`. yaw/pitch must survive into `to`
// (focus keeps the user's orientation; only target + distance change).
const FROM: CameraPose = { target: [9, 9, 9], yaw: 1.23, pitch: -0.4, distance: 5 };
const FOVY = 0.8;
const FRAME = 'galactic';
const MOTION: FocusMotion = { style: 'eased', durationMs: 600, ease: 'easeOutCubic' };

/** Where `type`'s arrival lands for an object of `radiusMpc`, at the test FOV. */
const arrivalAt = (type: string, radiusMpc: number) =>
  arrivalFraming({ type, positionMpc: [0, 0, 0], radiusMpc }, selectionKindOf(type).focus!, FOVY)
    .distance;

const galaxyRow = (over: Partial<GalaxyRow> = {}) =>
  makeGalaxyRow({
    source: 'sdss',
    index: 7,
    objId: '12345',
    x: 1,
    y: 2,
    z: 3,
    redshift: 0.01,
    diameterKpc: 40,
    axisRatio: 1,
    ...over,
  });

const structureRow = (over: Partial<StructureInfo> = {}) =>
  placedStructureRow({
    type: 'structure',
    worldPos: [10, -20, 30],
    physicalRadiusMpc: 2,
    apparentRadiusMpc: 5,
    ...over,
  } as StructureInfo);

describe('focusTweenDescriptor', () => {
  it('carries the live from-pose, the caller-given motion, and the caller-stamped frame', () => {
    const d = focusTweenDescriptor(galaxyRow(), FROM, FOVY, MOTION, FRAME);
    expect(d.from).toBe(FROM);
    expect(d.motion).toBe(MOTION);
    expect(d.frame).toBe(FRAME);
  });

  it('a galaxy row targets its position and frames on its diameter, keeping yaw/pitch', () => {
    const d = focusTweenDescriptor(
      galaxyRow({ x: 1, y: 2, z: 3, diameterKpc: 40 }),
      FROM,
      FOVY,
      MOTION,
      FRAME,
    );
    expect(d.to.target).toEqual([1, 2, 3]);
    expect(d.to.distance).toBe(arrivalAt('galaxyCatalog', 0.02));
    expect(d.to.yaw).toBe(FROM.yaw);
    expect(d.to.pitch).toBe(FROM.pitch);
  });

  it('a structure row frames on its apparent radius via the lens FOV', () => {
    const d = focusTweenDescriptor(
      structureRow({ apparentRadiusMpc: 5 }),
      FROM,
      FOVY,
      MOTION,
      FRAME,
    );
    expect(d.to.target).toEqual([10, -20, 30]);
    expect(d.to.distance).toBe(arrivalAt('structure', 5));
  });

  it('a structure row falls back to its physical radius when no apparent radius', () => {
    const d = focusTweenDescriptor(
      structureRow({ apparentRadiusMpc: undefined, physicalRadiusMpc: 2 }),
      FROM,
      FOVY,
      MOTION,
      FRAME,
    );
    expect(d.to.distance).toBe(arrivalAt('structure', 2));
  });

  it('the Milky Way arm targets the galactic centre, framing its disc', () => {
    const d = focusTweenDescriptor(MILKY_WAY_ROW, FROM, FOVY, MOTION, FRAME);
    expect(d.to.target).toEqual([
      MILKY_WAY_CENTER_WORLD[0],
      MILKY_WAY_CENTER_WORLD[1],
      MILKY_WAY_CENTER_WORLD[2],
    ]);
    expect(d.to.distance).toBe(arrivalAt('milkyWay', 0.0175));
    expect(d.to.yaw).toBe(FROM.yaw);
  });

  it('copies the target into a fresh array — never aliases the source Vec3', () => {
    const struct = structureRow({ worldPos: [10, -20, 30] });
    const d = focusTweenDescriptor(struct, FROM, FOVY, MOTION, FRAME);
    expect(d.to.target).not.toBe(struct.worldPos);
  });
});
