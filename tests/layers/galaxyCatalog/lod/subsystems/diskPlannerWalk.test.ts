/**
 * diskPlannerWalk — unit tests for the shared disk-planner catalog walk.
 *
 * Coverage focus:
 *   - visitor lifecycle ordering: beginBlock → onRow per surviving row →
 *     endSource per source, one endFrame after all sources; hidden sources
 *     get onSourceHidden and nothing else
 *   - the squared-distance early-out uses the LOOSER 8-px bound, so rows the
 *     procedural body needs (invisible to a 24-px bound) still reach onRow
 *   - the walk applies NO px gate — gating on apparent size is each body's
 *     job inside onRow
 *   - the single shared stride cursor advances once per frame and both
 *     visitor slots see the identical window
 *   - a per-frame row-accept budget caps admission to onRow regardless of how
 *     many rows clear the distance gate (the narrow-FOV admission-sphere bug)
 */

import type { GalaxyCatalogId } from '../../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';
import { GALAXY_CATALOG_IDS } from '../../../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { describe, it, expect } from 'vitest';
import { mat4 } from 'wgpu-matrix';
import { frustumPlanesFromViewProj } from '../../../../../src/utils/camera/frustum/frustumPlanesFromViewProj';
import { occluderConesFrom } from '../../../../../src/utils/occlusion/occluderConesFrom';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import {
  createDiskPlannerWalk,
  DISK_ROW_ACCEPT_BUDGET,
} from '../../../../../src/layers/galaxyCatalog/lod/subsystems/diskPlannerWalk';
import { noopDiskRowVisitor } from '../../../../services/engine/subsystems/diskWalkHarness';
import type { DiskRowVisitor } from '../../../../../src/layers/galaxyCatalog/lod/@types/DiskRowVisitor';
import type { GalaxyCatalog } from '../../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { OrbitCamera } from '../../../../../src/@types/camera/orbitCamera/OrbitCamera';
import { makeGalaxyCatalog } from '../../../../fixtures/makeGalaxyCatalog';
import { galaxyRecordsOver } from '../../../../support/galaxyRecordsOver';

const ALL_CATALOGS: ReadonlySet<GalaxyCatalogId> = new Set(GALAXY_CATALOG_IDS);

/**
 * Camera fixed at the origin so a row at (d, 0, 0) sits exactly d Mpc away —
 * the walk only reads `cam.position`.
 */
function makeCam(): OrbitCamera {
  return { position: new Float32Array([0, 0, 0]) } as unknown as OrbitCamera;
}

/**
 * One row per entry, on the +x axis at the given camera distance. With
 * pxPerRad = 600 the geometry is hand-checkable:
 *   px            = (diameterKpc / 1000 / distMpc) · 600
 *   8-px  early-out bound (maxDiameterKpc 200) = (0.2 · 600) / 8  = 15 Mpc
 *   24-px would-be bound                       = (0.2 · 600) / 24 =  5 Mpc
 */
function makeCatalog(rows: readonly { distMpc: number; diameterKpc: number }[]): GalaxyCatalog {
  const count = rows.length;
  const positions = new Float32Array(count * 3);
  const diameterKpc = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = rows[i]!.distMpc;
    diameterKpc[i] = rows[i]!.diameterKpc;
  }
  const fill = (v: number): Float32Array => {
    const a = new Float32Array(count);
    a.fill(v);
    return a;
  };
  return makeGalaxyCatalog(count, {
    objIDs: new BigUint64Array(count),
    positions,
    magU: fill(20),
    magG: fill(20),
    magR: fill(20),
    magI: fill(20),
    magZ: fill(20),
    axisRatio: fill(0.7),
    positionAngleDeg: fill(45),
    diameterKpc,
  });
}

const PX_PER_RAD = 600;

function makeInput(
  catalogs: Map<GalaxyCatalogId, GalaxyCatalog>,
  visibleCatalogs: ReadonlySet<GalaxyCatalogId> = ALL_CATALOGS,
) {
  return {
    cam: makeCam(),
    records: galaxyRecordsOver(catalogs),
    visibleCatalogs,
    pxPerRad: PX_PER_RAD,
    viewPlanes: new Float32Array(0),
    occluderCones: new Float64Array(0),
    sourceOpacity: () => 1,
  };
}

type WalkEvent = readonly (string | number)[];

/** Records the lifecycle sequence; onRow keeps only (source, i) for toEqual. */
function recordingVisitor(events: WalkEvent[]): DiskRowVisitor {
  return {
    onSourceHidden: (source) => events.push(['onSourceHidden', source]),
    beginBlock: (source, safeStart, end) => events.push(['beginBlock', source, safeStart, end]),
    onRow: (source, _catalog, i) => events.push(['onRow', source, i]),
    endSource: (source) => events.push(['endSource', source]),
    endFrame: () => events.push(['endFrame']),
  };
}

/** Captures the full per-row geometry the walk hands to onRow. */
function rowCapturingVisitor(rows: { i: number; camDist: number; px: number }[]): DiskRowVisitor {
  return {
    onSourceHidden() {},
    beginBlock() {},
    onRow: (_source, _catalog, i, _x, _y, _z, camDist, px) => rows.push({ i, camDist, px }),
    endSource() {},
    endFrame() {},
  };
}

describe('createDiskPlannerWalk', () => {
  it('walkDiskRows drives beginBlock then onRow per surviving row then endSource then endFrame in order', () => {
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    const rows = [
      { distMpc: 1, diameterKpc: 50 },
      { distMpc: 1.1, diameterKpc: 50 },
      { distMpc: 1.2, diameterKpc: 50 },
    ];
    const catalogs = new Map<GalaxyCatalogId, GalaxyCatalog>([
      ['sdss', makeCatalog(rows)],
      ['famousGalaxy', makeCatalog(rows)],
    ]);
    const events: WalkEvent[] = [];
    // Only the SDSS bit is set — FamousGalaxy is hidden this frame.
    walk.runFrame(
      makeInput(catalogs, new Set(['sdss'])),
      recordingVisitor(events),
      noopDiskRowVisitor(),
    );
    expect(events).toEqual([
      ['beginBlock', 'sdss', 0, 3],
      ['onRow', 'sdss', 0],
      ['onRow', 'sdss', 1],
      ['onRow', 'sdss', 2],
      ['endSource', 'sdss'],
      ['onSourceHidden', 'famousGalaxy'],
      ['endFrame'],
    ]);
  });

  it('walk early-out uses the 8px bound so a row visible at 8px but not 24px still reaches onRow', () => {
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    // Row 0: 10 Mpc — beyond the would-be 24-px bound (5 Mpc) but inside the
    // 8-px bound (15 Mpc); px = 12, squarely between the two thresholds.
    // Row 1: 20 Mpc — beyond even the 8-px bound; the early-out must drop it.
    const catalogs = new Map<GalaxyCatalogId, GalaxyCatalog>([
      [
        'sdss',
        makeCatalog([
          { distMpc: 10, diameterKpc: 200 },
          { distMpc: 20, diameterKpc: 200 },
        ]),
      ],
    ]);
    const rows: { i: number; camDist: number; px: number }[] = [];
    walk.runFrame(makeInput(catalogs), rowCapturingVisitor(rows), noopDiskRowVisitor());
    expect(rows.length).toBe(1);
    expect(rows[0]!.i).toBe(0);
    expect(rows[0]!.camDist).toBeCloseTo(10, 5);
    expect(rows[0]!.px).toBeCloseTo(12, 5);
  });

  it('walk applies no px gate — every row past the distance early-out reaches onRow', () => {
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    // A tiny galaxy: px = (5 / 1000 / 10) · 600 = 0.3, far below the 8-px
    // procedural gate — but the walk must still deliver it; dropping
    // sub-threshold rows is the BODY's decision inside onRow.
    const catalogs = new Map<GalaxyCatalogId, GalaxyCatalog>([
      ['sdss', makeCatalog([{ distMpc: 10, diameterKpc: 5 }])],
    ]);
    const rows: { i: number; camDist: number; px: number }[] = [];
    walk.runFrame(makeInput(catalogs), rowCapturingVisitor(rows), noopDiskRowVisitor());
    expect(rows.length).toBe(1);
    expect(rows[0]!.px).toBeCloseTo(0.3, 5);
    expect(rows[0]!.px).toBeLessThan(8);
  });

  it('single shared cursor advances once per frame across both visitor slots', () => {
    const walk = createDiskPlannerWalk({ decimationFactor: 2 });
    const rows = [
      { distMpc: 1, diameterKpc: 50 },
      { distMpc: 1.1, diameterKpc: 50 },
      { distMpc: 1.2, diameterKpc: 50 },
      { distMpc: 1.3, diameterKpc: 50 },
    ];
    const catalogs = new Map<GalaxyCatalogId, GalaxyCatalog>([['sdss', makeCatalog(rows)]]);

    const proceduralEvents: WalkEvent[] = [];
    const texturedEvents: WalkEvent[] = [];
    const procedural = recordingVisitor(proceduralEvents);
    const textured = recordingVisitor(texturedEvents);

    const windowsOf = (events: WalkEvent[]) =>
      events.filter((e) => e[0] === 'beginBlock').map((e) => [e[2], e[3]]);

    walk.runFrame(makeInput(catalogs), procedural, textured);
    walk.runFrame(makeInput(catalogs), procedural, textured);

    // Both slots see the SAME window each frame (one shared cursor, advanced
    // once per frame — not once per visitor).
    expect(windowsOf(proceduralEvents)).toEqual([
      [0, 2],
      [2, 4],
    ]);
    expect(windowsOf(texturedEvents)).toEqual([
      [0, 2],
      [2, 4],
    ]);
  });

  it('caps rows admitted to onRow at DISK_ROW_ACCEPT_BUDGET per frame, even when every row in a huge window clears the distance gate', () => {
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    // Every row sits at 1 Mpc, well inside the 15 Mpc / 8-px bound (see the
    // worked example on `makeCatalog` above) — a narrow-FOV pxPerRad would
    // admit a catalog this size in full without the budget.
    const rowCount = DISK_ROW_ACCEPT_BUDGET * 4;
    const rows = Array.from({ length: rowCount }, () => ({ distMpc: 1, diameterKpc: 50 }));
    const catalogs = new Map<GalaxyCatalogId, GalaxyCatalog>([['sdss', makeCatalog(rows)]]);
    const events: WalkEvent[] = [];
    walk.runFrame(makeInput(catalogs), recordingVisitor(events), noopDiskRowVisitor());
    const onRowCount = events.filter((e) => e[0] === 'onRow').length;
    expect(onRowCount).toBe(DISK_ROW_ACCEPT_BUDGET);
  });

  it('hands only rows inside a view to onRow, so off-screen rows cannot spend the budget at narrow FOV', () => {
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    // A budget's worth of rows behind the camera, then one row dead ahead.
    const behind = Array.from({ length: DISK_ROW_ACCEPT_BUDGET }, () => ({
      distMpc: -1,
      diameterKpc: 50,
    }));
    const rows = [...behind, { distMpc: 1, diameterKpc: 50 }];
    const catalogs = new Map<GalaxyCatalogId, GalaxyCatalog>([['sdss', makeCatalog(rows)]]);
    // A 0.5° view along +x from the origin, where the camera sits.
    const vp = mat4.multiply(
      mat4.perspective((0.5 * Math.PI) / 180, 1, 0.01, 1e5),
      mat4.lookAt([0, 0, 0], [1, 0, 0], [0, 0, 1]),
    );
    const events: WalkEvent[] = [];
    walk.runFrame(
      { ...makeInput(catalogs), viewPlanes: frustumPlanesFromViewProj(vp) },
      recordingVisitor(events),
      noopDiskRowVisitor(),
    );
    expect(events.filter((e) => e[0] === 'onRow')).toEqual([['onRow', 'sdss', rows.length - 1]]);
  });

  describe('a body in front of the galaxies', () => {
    // A body half a Mpc down +x with a 0.25 Mpc radius: a 30° disc seen from the origin.
    const occluderCones = occluderConesFrom(
      [{ positionMpc: [0.5, 0, 0], radiusM: 0.25 / SCALE_UNITS.M_TO_MPC, outerRadiusM: 0 }],
      [0, 0, 0],
    );
    const viewAlong = (fovDeg: number, look: [number, number, number]) =>
      frustumPlanesFromViewProj(
        mat4.multiply(
          mat4.perspective((fovDeg * Math.PI) / 180, 1, 0.01, 1e5),
          mat4.lookAt([0, 0, 0], look, [0, 0, 1]),
        ),
      );
    const catalogs = new Map<GalaxyCatalogId, GalaxyCatalog>([
      ['sdss', makeCatalog([{ distMpc: 2, diameterKpc: 50 }])],
    ]);

    it('hands no row behind the body to onRow', () => {
      const walk = createDiskPlannerWalk({ decimationFactor: 1 });
      const events: WalkEvent[] = [];
      walk.runFrame(
        { ...makeInput(catalogs), viewPlanes: viewAlong(90, [1, 0, 0]), occluderCones },
        recordingVisitor(events),
        noopDiskRowVisitor(),
      );
      expect(events.filter((e) => e[0] === 'onRow')).toEqual([]);
    });

    it('handles every source as hidden when every view is on the body', () => {
      const walk = createDiskPlannerWalk({ decimationFactor: 1 });
      const events: WalkEvent[] = [];
      walk.runFrame(
        { ...makeInput(catalogs), viewPlanes: viewAlong(0.5, [1, 0, 0]), occluderCones },
        recordingVisitor(events),
        noopDiskRowVisitor(),
      );
      expect(events.map((e) => e[0])).toEqual(['onSourceHidden', 'endFrame']);
    });
  });
});
