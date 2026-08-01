import { describe, it, expect } from 'vitest';

import { focusTweenDescriptor } from '../../../src/state/camera/focusTweenDescriptor';
import { galaxyFocusDistance } from '../../../src/services/engine/camera/galaxyFocusDistance';
import { structureFocusDistance } from '../../../src/services/engine/camera/structureFocusDistance';
import {
  MILKY_WAY_CENTER_WORLD,
  MILKY_WAY_VIEW_DISTANCE_MPC,
} from '../../../src/data/milkyWay/galacticCenter';
import { FOCUS_TWEEN_MS } from '../../../src/services/engine/camera/focusTweenDuration';
import { makeGalaxyRow } from '../../fixtures/makeGalaxyRow';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { GalaxyRow } from '../../../src/@types/engine/GalaxyRow';
import type { StructureInfo } from '../../../src/@types/data/structure/StructureInfo';

// A representative live pose to seed `from`. yaw/pitch must survive into `to`
// (focus keeps the user's orientation; only target + distance change).
const FROM: CameraPose = { target: [9, 9, 9], yaw: 1.23, pitch: -0.4, distance: 5 };
const FOVY = 0.8;
const FRAME = 'galactic';

const galaxyRow = (over: Partial<GalaxyRow> = {}): GalaxyRow =>
  makeGalaxyRow({
    source: 0,
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

const structureRow = (over: Partial<StructureInfo> = {}): StructureInfo =>
  ({
    type: 'structure',
    worldPos: [10, -20, 30],
    physicalRadiusMpc: 2,
    apparentRadiusMpc: 5,
    ...over,
  }) as StructureInfo;

describe('focusTweenDescriptor', () => {
  it('carries the live from-pose, FOCUS_TWEEN_MS, easeOutCubic, and the caller-stamped frame', () => {
    const d = focusTweenDescriptor(galaxyRow(), FROM, FOVY, FRAME);
    expect(d.from).toBe(FROM);
    expect(d.durationMs).toBe(FOCUS_TWEEN_MS);
    expect(d.easing).toBe('easeOutCubic');
    expect(d.frame).toBe(FRAME);
  });

  it('a galaxy row targets its position and frames on its diameter, keeping yaw/pitch', () => {
    const d = focusTweenDescriptor(
      galaxyRow({ x: 1, y: 2, z: 3, diameterKpc: 40 }),
      FROM,
      FOVY,
      FRAME,
    );
    expect(d.to.target).toEqual([1, 2, 3]);
    expect(d.to.distance).toBe(galaxyFocusDistance(40));
    expect(d.to.yaw).toBe(FROM.yaw);
    expect(d.to.pitch).toBe(FROM.pitch);
  });

  it('a structure row frames on its apparent radius via the lens FOV', () => {
    const d = focusTweenDescriptor(structureRow({ apparentRadiusMpc: 5 }), FROM, FOVY, FRAME);
    expect(d.to.target).toEqual([10, -20, 30]);
    expect(d.to.distance).toBe(structureFocusDistance(5, FOVY));
  });

  it('a structure row falls back to its physical radius when no apparent radius', () => {
    const d = focusTweenDescriptor(
      structureRow({ apparentRadiusMpc: undefined, physicalRadiusMpc: 2 }),
      FROM,
      FOVY,
      FRAME,
    );
    expect(d.to.distance).toBe(structureFocusDistance(2, FOVY));
  });

  it('the Milky Way arm targets the galactic centre at the fixed view distance', () => {
    const d = focusTweenDescriptor({ type: 'milkyWay' }, FROM, FOVY, FRAME);
    expect(d.to.target).toEqual([
      MILKY_WAY_CENTER_WORLD[0],
      MILKY_WAY_CENTER_WORLD[1],
      MILKY_WAY_CENTER_WORLD[2],
    ]);
    expect(d.to.distance).toBe(MILKY_WAY_VIEW_DISTANCE_MPC);
    expect(d.to.yaw).toBe(FROM.yaw);
  });

  it('copies the target into a fresh array — never aliases the source Vec3', () => {
    const struct = structureRow({ worldPos: [10, -20, 30] });
    const d = focusTweenDescriptor(struct, FROM, FOVY, FRAME);
    expect(d.to.target).not.toBe(struct.worldPos);
  });
});
