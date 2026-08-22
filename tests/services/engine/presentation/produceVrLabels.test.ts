/**
 * produceVrLabels — pure arc-placement geometry (anchor identity, upright
 * facing, degenerate-direction fallback) plus the producer's gating, position
 * derivation, and nearest-N cap. `vrOverride` is a plain mutable singleton
 * (THROWAWAY spike state), so tests drive it directly and reset it after.
 */

import { describe, it, expect, afterEach } from 'vitest';

import {
  produceVrLabels,
  vrLabelArcPlacement,
} from '../../../../src/services/engine/presentation/produceVrLabels';
import { vrOverride } from '../../../../src/services/xr/vrSpikeState';
import type { VrEye } from '../../../../src/services/xr/vrSpikeState';
import { Source } from '../../../../src/data/sources';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const CTX = {} as ReadyFrameContext;

function makeEye(camPos: Vec3): VrEye {
  return { camPos } as unknown as VrEye;
}

afterEach(() => {
  vrOverride.active = false;
  vrOverride.eyes = [];
});

describe('vrLabelArcPlacement', () => {
  it('reconstructs the anchor exactly at startAngleRad=0, for any radius', () => {
    const anchor: Vec3 = [10, 2, -5];
    const head: Vec3 = [0, 0, 0];
    const p = vrLabelArcPlacement(anchor, head, 0.5);
    const [cx, cy, cz] = p.center;
    expect(cx + p.radiusMpc * p.referenceDir[0]).toBeCloseTo(anchor[0], 6);
    expect(cy + p.radiusMpc * p.referenceDir[1]).toBeCloseTo(anchor[1], 6);
    expect(cz + p.radiusMpc * p.referenceDir[2]).toBeCloseTo(anchor[2], 6);
  });

  it('stands upright on world +Y and faces its front normal back toward the head', () => {
    const anchor: Vec3 = [10, 0, 0];
    const head: Vec3 = [0, 0, 0];
    const p = vrLabelArcPlacement(anchor, head, 0.5);
    expect(p.planeNormal).toEqual([0, 1, 0]);
    // label3d/vertex.wesl's cross(xAxis, yAxis) at startAngleRad=0 works out to
    // -referenceDir — the glyph run's front-facing normal — so it must point
    // from the anchor back toward the head for the text to read the right
    // way round (see this module's docblock derivation).
    const towardHead: Vec3 = [head[0] - anchor[0], head[1] - anchor[1], head[2] - anchor[2]];
    const frontNormal: Vec3 = [-p.referenceDir[0], -p.referenceDir[1], -p.referenceDir[2]];
    const dot =
      frontNormal[0] * towardHead[0] +
      frontNormal[1] * towardHead[1] +
      frontNormal[2] * towardHead[2];
    expect(dot).toBeGreaterThan(0);
  });

  it('falls back to an arbitrary horizontal axis when the anchor is directly overhead', () => {
    const anchor: Vec3 = [0, 5, 0];
    const head: Vec3 = [0, 0, 0];
    const p = vrLabelArcPlacement(anchor, head, 0.5);
    expect(p.referenceDir[1]).toBe(0);
    expect(Number.isFinite(p.referenceDir[0])).toBe(true);
    expect(Number.isFinite(p.center[0])).toBe(true);
  });
});

type StructureFixture = {
  readonly id: string;
  readonly name: string;
  readonly worldPos: Vec3;
  readonly category: string;
  readonly featured: boolean;
};

function makeState(opts: {
  famousLabelEnabled?: boolean;
  famousMeta?: ReadonlyArray<{ id: string; names: string[] }>;
  famousPositions?: readonly number[];
  structureRecords?: readonly StructureFixture[];
  structureLabelEnabled?: Record<string, boolean>;
}): EngineState {
  const famousMeta = opts.famousMeta ?? [];
  const positions = opts.famousPositions ?? [];
  const structureRecords = opts.structureRecords ?? [];

  const structureItems: Record<string, { labelEnabled: boolean }> = {};
  for (const s of structureRecords) {
    structureItems[s.category] = {
      labelEnabled: opts.structureLabelEnabled?.[s.category] ?? true,
    };
  }

  return {
    settings: {
      galaxyCatalogs: {
        items: { famousGalaxy: { labelEnabled: opts.famousLabelEnabled ?? true } },
      },
      structures: { items: structureItems },
    },
    famousGalaxiesMeta: famousMeta,
    data: {
      galaxies: {
        get: (source: unknown) =>
          source === Source.FamousGalaxy && famousMeta.length > 0
            ? { count: famousMeta.length, positions: Float32Array.from(positions) }
            : undefined,
      },
      structures: { all: () => structureRecords },
    },
  } as unknown as EngineState;
}

describe('produceVrLabels', () => {
  it('emits nothing when the VR override is inactive', () => {
    vrOverride.active = false;
    const out = produceVrLabels(makeState({ famousMeta: [{ id: 'm31', names: ['M31'] }] }), CTX);
    expect(out).toEqual({ labels: [], awake: false });
  });

  it('emits nothing when active but no eye poses have been recorded yet', () => {
    vrOverride.active = true;
    vrOverride.eyes = [];
    const out = produceVrLabels(makeState({ famousMeta: [{ id: 'm31', names: ['M31'] }] }), CTX);
    expect(out.labels).toEqual([]);
  });

  it('places a famous-galaxy label exactly at its catalog position, sized by head distance', () => {
    vrOverride.active = true;
    vrOverride.eyes = [makeEye([0, 0, 0])];
    const state = makeState({
      famousMeta: [{ id: 'm31', names: ['M31'] }],
      famousPositions: [10, 0, 0],
    });

    const out = produceVrLabels(state, CTX);
    expect(out.labels).toHaveLength(1);
    const label = out.labels[0]!;
    expect(label.id).toBe('vr-famous-m31');
    expect(label.text).toBe('M31');
    const p = label.placement;
    expect(p.center[0] + p.radiusMpc * p.referenceDir[0]).toBeCloseTo(10, 6);
    expect(p.center[1] + p.radiusMpc * p.referenceDir[1]).toBeCloseTo(0, 6);
    expect(p.center[2] + p.radiusMpc * p.referenceDir[2]).toBeCloseTo(0, 6);
    // Constant-apparent-size sizing: em scales linearly with head distance.
    expect(label.emMpc).toBeCloseTo(10 * Math.tan(0.0314), 6);
  });

  it('skips a famous label when famousGalaxy.labelEnabled is off', () => {
    vrOverride.active = true;
    vrOverride.eyes = [makeEye([0, 0, 0])];
    const state = makeState({
      famousLabelEnabled: false,
      famousMeta: [{ id: 'm31', names: ['M31'] }],
      famousPositions: [10, 0, 0],
    });
    expect(produceVrLabels(state, CTX).labels).toEqual([]);
  });

  it('emits only featured, label-enabled structures', () => {
    vrOverride.active = true;
    vrOverride.eyes = [makeEye([0, 0, 0])];
    const state = makeState({
      structureRecords: [
        {
          id: 'coma',
          name: 'Coma Cluster',
          worldPos: [5, 0, 0],
          category: 'cluster',
          featured: true,
        },
        {
          id: 'bulk1',
          name: 'Bulk Cluster',
          worldPos: [6, 0, 0],
          category: 'cluster',
          featured: false,
        },
        { id: 'lg', name: 'Local Void', worldPos: [7, 0, 0], category: 'void', featured: true },
      ],
      structureLabelEnabled: { void: false },
    });

    const out = produceVrLabels(state, CTX);
    expect(out.labels.map((l) => l.id)).toEqual(['vr-structure-coma']);
  });

  it('caps emitted labels to the nearest 24 by distance from the head', () => {
    vrOverride.active = true;
    vrOverride.eyes = [makeEye([0, 0, 0])];
    const famousMeta = Array.from({ length: 30 }, (_, i) => ({ id: `g${i}`, names: [`G${i}`] }));
    const famousPositions = famousMeta.flatMap((_, i) => [i + 1, 0, 0]);
    const state = makeState({ famousMeta, famousPositions });

    const out = produceVrLabels(state, CTX);
    expect(out.labels).toHaveLength(24);
    expect(out.labels.map((l) => l.id)).toContain('vr-famous-g0');
    expect(out.labels.map((l) => l.id)).not.toContain('vr-famous-g29');
  });
});
