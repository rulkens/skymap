/**
 * produceVrLabels — pure arc-placement geometry (anchor identity), the
 * mirroring-sign derivation (load-bearing: a wrong facing sign silently
 * mirrors text, see `shaders/labels3d/vertex.wesl`), and the producer's
 * gating, above-object offset, and nearest-N caps for both channels.
 * `vrOverride` is a plain mutable singleton (THROWAWAY spike state), so
 * tests drive it directly and reset it after.
 */

import { describe, it, expect, afterEach } from 'vitest';

import {
  produceVrLabels,
  vrLabelArcPlacement,
} from '../../../../src/services/engine/presentation/produceVrLabels';
import { rejectVec3 } from '../../../../src/utils/math/rejectVec3';
import { cross3 } from '../../../../src/utils/math/cross3';
import { vrOverride } from '../../../../src/services/xr/vrSpikeState';
import type { VrEye } from '../../../../src/services/xr/vrSpikeState';
import { Source } from '../../../../src/data/sources';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const CTX = { simDays: 0 } as unknown as ReadyFrameContext;

function makeEye(camPos: Vec3): VrEye {
  return { camPos } as unknown as VrEye;
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

afterEach(() => {
  vrOverride.active = false;
  vrOverride.eyes = [];
  vrOverride.physicalUpWorld = [0, 1, 0];
});

describe('vrLabelArcPlacement', () => {
  it('reconstructs the anchor exactly at startAngleRad=0, for any radius', () => {
    const center: Vec3 = [10, 2, -5];
    const referenceDir: Vec3 = [0, 0, 1];
    const planeNormal: Vec3 = [0, 1, 0];
    const p = vrLabelArcPlacement(center, planeNormal, referenceDir, 0.5);
    const [cx, cy, cz] = p.center;
    expect(cx + p.radiusMpc * p.referenceDir[0]).toBeCloseTo(center[0], 6);
    expect(cy + p.radiusMpc * p.referenceDir[1]).toBeCloseTo(center[1], 6);
    expect(cz + p.radiusMpc * p.referenceDir[2]).toBeCloseTo(center[2], 6);
  });

  it('passes planeNormal/referenceDir/radius through unchanged', () => {
    const planeNormal: Vec3 = [0, 0.7071, 0.7071];
    const referenceDir: Vec3 = [0, 0.7071, -0.7071];
    const p = vrLabelArcPlacement([1, 2, 3], planeNormal, referenceDir, 4);
    expect(p.planeNormal).toBe(planeNormal);
    expect(p.referenceDir).toBe(referenceDir);
    expect(p.radiusMpc).toBe(4);
    expect(p.startAngleRad).toBe(0);
  });
});

/**
 * The mirroring-sign derivation. Ground truth (see `vertex.wesl`): binormal =
 * cross(planeNormal, referenceDir); glyph i's anchor sits at `theta_i =
 * -localOffset_i.x * mpcPerAtlasPx / radiusMpc` (repeatAngle=0,
 * startAngleRad=0); its world position (corner=0, lat=0) is
 * `center + radiusMpc * (cos(theta_i)*referenceDir + sin(theta_i)*binormal)`.
 * Text reads unmirrored iff a LATER glyph (larger localOffset.x) displaces
 * toward the VIEWER's right — the same right-hand axis `viewFromBasis`
 * (vrSpikeState.ts) builds a camera from: `right = normalize(cross(forward,
 * up))`, `forward = normalize(anchor - head)`.
 *
 * This is resolved by choosing `referenceDir = normalize(reject(anchor -
 * head, up))` (produceVrLabels' `resolveReferenceDir`, replicated here
 * directly since it's module-private) — the numeric case below uses a
 * TILTED `up` (not world-Y) to prove the sign holds generally, not only for
 * the axis-aligned case.
 */
describe('vrLabelArcPlacement — glyph run reads left-to-right, not mirrored', () => {
  it('for a tilted physical-up axis, a later glyph displaces toward the viewer’s right', () => {
    const up: Vec3 = normalize([0, 1, 1]);
    const head: Vec3 = [0, 0, 5];
    const anchor: Vec3 = [0, 0, 0];

    const raw: Vec3 = [anchor[0] - head[0], anchor[1] - head[1], anchor[2] - head[2]];
    const referenceDir = normalize(rejectVec3(normalize(raw), up));

    const emMpc = 0.001;
    const radiusMpc = 2000 * emMpc;
    const placement = vrLabelArcPlacement(anchor, up, referenceDir, radiusMpc);

    const ATLAS_EM_PX = 84;
    const mpcPerAtlasPx = emMpc / ATLAS_EM_PX;
    const binormal = cross3(placement.planeNormal, placement.referenceDir);

    function glyphWorldPos(localOffsetX: number): Vec3 {
      const arcRad = (localOffsetX * mpcPerAtlasPx) / placement.radiusMpc;
      const theta = placement.startAngleRad - arcRad;
      const dir: Vec3 = [
        Math.cos(theta) * placement.referenceDir[0] + Math.sin(theta) * binormal[0],
        Math.cos(theta) * placement.referenceDir[1] + Math.sin(theta) * binormal[1],
        Math.cos(theta) * placement.referenceDir[2] + Math.sin(theta) * binormal[2],
      ];
      return [
        placement.center[0] + placement.radiusMpc * dir[0],
        placement.center[1] + placement.radiusMpc * dir[1],
        placement.center[2] + placement.radiusMpc * dir[2],
      ];
    }

    const firstGlyph = glyphWorldPos(0);
    const laterGlyph = glyphWorldPos(20);

    // The viewer's own right-hand axis, built the same way viewFromBasis does:
    // forward = anchor - head (viewer looks FROM head TOWARD the anchor).
    const forward = normalize([anchor[0] - head[0], anchor[1] - head[1], anchor[2] - head[2]]);
    const viewerRight = normalize(cross3(forward, up));

    const displacement: Vec3 = [
      laterGlyph[0] - firstGlyph[0],
      laterGlyph[1] - firstGlyph[1],
      laterGlyph[2] - firstGlyph[2],
    ];
    const towardViewerRight =
      displacement[0] * viewerRight[0] +
      displacement[1] * viewerRight[1] +
      displacement[2] * viewerRight[2];

    expect(towardViewerRight).toBeGreaterThan(0);
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
    expect(out).toEqual({ labels: [], labelsNear0: [], awake: false });
  });

  it('emits nothing when active but no eye poses have been recorded yet', () => {
    vrOverride.active = true;
    vrOverride.eyes = [];
    const out = produceVrLabels(makeState({ famousMeta: [{ id: 'm31', names: ['M31'] }] }), CTX);
    expect(out.labels).toEqual([]);
    expect(out.labelsNear0).toEqual([]);
  });

  it('places a famous-galaxy label above the object along the physical-up axis, sized by head distance', () => {
    vrOverride.active = true;
    vrOverride.eyes = [makeEye([0, 0, 0])];
    vrOverride.physicalUpWorld = [0, 1, 0];
    const state = makeState({
      famousMeta: [{ id: 'm31', names: ['M31'] }],
      famousPositions: [10, 0, 0],
    });

    const out = produceVrLabels(state, CTX);
    expect(out.labels).toHaveLength(1);
    const label = out.labels[0]!;
    expect(label.id).toBe('vr-famous-m31');
    expect(label.text).toBe('M31');
    // Constant-apparent-size sizing: em scales linearly with head distance.
    expect(label.emMpc).toBeCloseTo(10 * Math.tan(0.0314), 6);
    // The anchor (center + radius·referenceDir) sits ABOVE the catalog
    // position by 1.5·emMpc along physicalUpWorld, not AT it.
    const p = label.placement;
    const anchor: Vec3 = [
      p.center[0] + p.radiusMpc * p.referenceDir[0],
      p.center[1] + p.radiusMpc * p.referenceDir[1],
      p.center[2] + p.radiusMpc * p.referenceDir[2],
    ];
    expect(anchor[1]).toBeCloseTo(1.5 * label.emMpc, 9);
    expect(anchor[0]).toBeCloseTo(10, 6);
    expect(anchor[2]).toBeCloseTo(0, 6);
    expect(p.planeNormal).toEqual([0, 1, 0]);
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

  it('caps emitted COSMO labels to the nearest 24 by distance from the head', () => {
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

  it('emits scene-body captions on the NEAR0 channel, not the COSMO channel', () => {
    vrOverride.active = true;
    vrOverride.eyes = [makeEye([0, 0, 0])];
    const state = makeState({});

    const out = produceVrLabels(state, CTX);
    const labelsNear0 = out.labelsNear0 ?? [];
    expect(labelsNear0.length).toBeGreaterThan(0);
    expect(labelsNear0.some((l) => l.id === 'vr-sceneBody-earth')).toBe(true);
    expect(out.labels.some((l) => l.id.startsWith('vr-sceneBody'))).toBe(false);
  });
});
