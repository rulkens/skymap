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
  capAndPlace,
} from '../../../../src/services/engine/presentation/produceVrLabels';
import type { VrLabelCandidate } from '../../../../src/services/engine/presentation/produceVrLabels';
import { near0VrRebasedVpF32 } from '../../../../src/services/engine/frame/passes/labels3dNear0Layer';
import { computeForegroundViewProj } from '../../../../src/utils/camera/computeForegroundViewProj';
import { forwardProjectPoint } from '../../../../src/utils/camera/forwardProjectPoint';
import { rejectVec3 } from '../../../../src/utils/math/rejectVec3';
import { cross3 } from '../../../../src/utils/math/cross3';
import { vrOverride } from '../../../../src/services/xr/vrSpikeState';
import type { VrEye } from '../../../../src/services/xr/vrSpikeState';
import { Source } from '../../../../src/data/sources';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { ForwardProjectedPoint } from '../../../../src/@types/camera/ForwardProjectedPoint';
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

/**
 * Decisive numeric test for the NEAR0 collapse bug: `labels3dNear0Layer`
 * draws through `near0VrRebasedVpF32(slab.vp, headWorldPos)`, which (per
 * `rebaseViewProj`'s contract) expects POSITIONS already shifted by the same
 * `headWorldPos` — not absolute world Mpc. `capAndPlace`'s `rebaseOriginMpc`
 * parameter is where that shift happens (`placeCandidate`'s header).
 *
 * The camera looks along X (`forward`), with Y as up: MIN_DISTANCE_MPC's
 * floor (1 parsec — vastly larger than any solar-system body's true
 * head-distance) pins every NEAR0 label's "above object" lift to the same
 * huge constant along Y regardless of the candidate's real position, which
 * would swamp a lift measured along the SAME axis as the test's own
 * separation. Keeping the two test bodies' separation on Z (orthogonal to
 * both forward and up) means that shared Y lift cancels out of the
 * comparison instead of confounding it — this test's own scope is the
 * head-frame bug, not that separate sizing constant.
 *
 * Un-fixed (`rebaseOriginMpc` reverted to the zero vector — see the `BUGGY`
 * comparison below), the two bodies' NDC-x positions differ by ~5e-5:
 * collapsed into the same clump, reproducing "all jumbled up in one place"
 * at solar-system scale, where the head's own ~AU-scale position dwarfs the
 * inter-body separation. Fixed, they separate by ~0.8 NDC — correctly, per
 * the ground-truth cross-check against the un-rebased `slabVp` (unambiguously
 * the right camera transform, since it's exactly what built the rebase).
 */
describe('NEAR0 label placement — frame consistency with near0VrRebasedVpF32', () => {
  const MPC_PER_KM = 1 / 3.0857e19;
  const AU_MPC = 4.848e-12;

  it('projects two head-scale-distant bodies to DISTINCT, correctly-separated screen x positions (does not collapse)', () => {
    // Head near Earth's orbit — deliberately NOT axis-aligned, so the bug
    // (which only shows up along the axes the head offset has weight on)
    // can't hide behind a lucky choice of axis.
    const head: Vec3 = [AU_MPC * 0.6, AU_MPC * 0.3, AU_MPC * 0.74];
    // Forward ⟂ up: keeps the MIN_DISTANCE_MPC-floored "above object" lift
    // (along up=Y) out of view-space depth, so clipW tracks true distance.
    const forward: Vec3 = [1, 0, 0];
    const target: Vec3 = [head[0] + forward[0], head[1] + forward[1], head[2] + forward[2]];

    // Two candidates 5000km in front of the head, ~2236km apart along Z.
    const p1: Vec3 = [head[0] + 5000 * MPC_PER_KM, head[1], head[2]];
    const p2: Vec3 = [head[0] + 5000 * MPC_PER_KM, head[1], head[2] + 2236 * MPC_PER_KM];

    const slabVp = computeForegroundViewProj({
      eyeMpc: head,
      targetMpc: target,
      up: [0, 1, 0],
      renderOrigin: [0, 0, 0],
      fovYRad: 1,
      aspect: 1,
      near: 100 * MPC_PER_KM,
      far: 1000,
      reversedZ: true,
    });

    const candidates: VrLabelCandidate[] = [
      { id: 'p1', text: 'P1', worldPos: p1, color: [1, 1, 1, 1] },
      { id: 'p2', text: 'P2', worldPos: p2, color: [1, 1, 1, 1] },
    ];

    function anchorOf(placement: (typeof labels)[number]['placement']): Vec3 {
      // Reconstruct the text anchor from the arc placement (existing idiom,
      // used above): anchor = center + radius·referenceDir.
      return [
        placement.center[0] + placement.radiusMpc * placement.referenceDir[0],
        placement.center[1] + placement.radiusMpc * placement.referenceDir[1],
        placement.center[2] + placement.radiusMpc * placement.referenceDir[2],
      ];
    }
    function ndcXOf(vp: Float32Array | Float64Array, p: Vec3): number {
      const out: ForwardProjectedPoint = {
        clipX: 0,
        clipY: 0,
        clipZ: 0,
        clipW: 0,
        screenX: 0,
        screenY: 0,
        onScreen: false,
      };
      forwardProjectPoint(vp, p[0], p[1], p[2], [1000, 1000], out);
      return out.clipX / out.clipW;
    }

    // The exact call `produceVrLabels` makes for the NEAR0 channel: the
    // rebase origin IS the head position. The pass's actual draw-time vp —
    // same function, same origin.
    const labels = capAndPlace(candidates, head, [0, 1, 0], 16, head);
    expect(labels).toHaveLength(2);
    const vpF32 = near0VrRebasedVpF32(slabVp, head);
    const ndcX1 = ndcXOf(vpF32, anchorOf(labels[0]!.placement));
    const ndcX2 = ndcXOf(vpF32, anchorOf(labels[1]!.placement));

    // Ground truth: the same anchors, converted back to absolute world Mpc,
    // through the RAW un-rebased `slabVp` — unambiguously correct, since
    // that's exactly the camera transform the rebase was built to match.
    const truthX1 = ndcXOf(slabVp, [
      ...anchorOf(labels[0]!.placement).map((v, i) => v + head[i]!),
    ] as Vec3);
    const truthX2 = ndcXOf(slabVp, [
      ...anchorOf(labels[1]!.placement).map((v, i) => v + head[i]!),
    ] as Vec3);
    expect(ndcX1).toBeCloseTo(truthX1, 3);
    expect(ndcX2).toBeCloseTo(truthX2, 3);

    // The decisive non-collapse assertion: the bodies' true ~2236km
    // separation, viewed from 5000km away, subtends a real angle — well
    // over 0.1 of NDC space, not the sub-percent clump the bug produces.
    expect(Math.abs(ndcX2 - ndcX1)).toBeGreaterThan(0.1);

    // Contrast with the UN-fixed behaviour (rebaseOriginMpc reverted to the
    // zero vector, i.e. `candidate.worldPos` fed straight through): the same
    // two bodies collapse to within a tiny fraction of that separation.
    const buggyLabels = capAndPlace(candidates, head, [0, 1, 0], 16, [0, 0, 0]);
    const buggyNdcX1 = ndcXOf(vpF32, anchorOf(buggyLabels[0]!.placement));
    const buggyNdcX2 = ndcXOf(vpF32, anchorOf(buggyLabels[1]!.placement));
    expect(Math.abs(buggyNdcX2 - buggyNdcX1)).toBeLessThan(0.001);
  });
});
