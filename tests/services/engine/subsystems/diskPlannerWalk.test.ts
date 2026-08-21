/**
 * diskPlannerWalk — unit tests for the shared disk-planner catalog walk.
 *
 * Coverage focus:
 *   - visitor lifecycle ordering: beginSource → onRow per surviving row →
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

import { describe, it, expect } from 'vitest';
import { Source } from '../../../../src/data/sources';
import {
  createDiskPlannerWalk,
  DISK_ROW_ACCEPT_BUDGET,
} from '../../../../src/services/engine/subsystems/diskPlannerWalk';
import { noopDiskRowVisitor } from './diskWalkHarness';
import type { DiskRowVisitor } from '../../../../src/@types/engine/subsystems/DiskRowVisitor';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import { makeGalaxyCatalog } from '../../../fixtures/makeGalaxyCatalog';

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

function makeInput(catalogs: Map<SourceType, GalaxyCatalog>, mask = 0xffffffff) {
  return { cam: makeCam(), catalogs, visibleSourceMask: mask, pxPerRad: PX_PER_RAD };
}

type WalkEvent = readonly (string | number)[];

/** Records the lifecycle sequence; onRow keeps only (source, i) for toEqual. */
function recordingVisitor(events: WalkEvent[]): DiskRowVisitor {
  return {
    onSourceHidden: (source) => events.push(['onSourceHidden', source]),
    beginSource: (source, safeStart, end) => events.push(['beginSource', source, safeStart, end]),
    onRow: (source, _catalog, i) => events.push(['onRow', source, i]),
    endSource: (source) => events.push(['endSource', source]),
    endFrame: () => events.push(['endFrame']),
  };
}

/** Captures the full per-row geometry the walk hands to onRow. */
function rowCapturingVisitor(rows: { i: number; camDist: number; px: number }[]): DiskRowVisitor {
  return {
    onSourceHidden() {},
    beginSource() {},
    onRow: (_source, _catalog, i, _x, _y, _z, camDist, px) => rows.push({ i, camDist, px }),
    endSource() {},
    endFrame() {},
  };
}

describe('createDiskPlannerWalk', () => {
  it('walkDiskRows drives beginSource then onRow per surviving row then endSource then endFrame in order', () => {
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    const rows = [
      { distMpc: 1, diameterKpc: 50 },
      { distMpc: 1.1, diameterKpc: 50 },
      { distMpc: 1.2, diameterKpc: 50 },
    ];
    const catalogs = new Map<SourceType, GalaxyCatalog>([
      [Source.SDSS, makeCatalog(rows)],
      [Source.FamousGalaxy, makeCatalog(rows)],
    ]);
    const events: WalkEvent[] = [];
    // Only the SDSS bit is set — FamousGalaxy is hidden this frame.
    walk.runFrame(
      makeInput(catalogs, 1 << Source.SDSS),
      recordingVisitor(events),
      noopDiskRowVisitor(),
    );
    expect(events).toEqual([
      ['beginSource', Source.SDSS, 0, 3],
      ['onRow', Source.SDSS, 0],
      ['onRow', Source.SDSS, 1],
      ['onRow', Source.SDSS, 2],
      ['endSource', Source.SDSS],
      ['onSourceHidden', Source.FamousGalaxy],
      ['endFrame'],
    ]);
  });

  it('walk early-out uses the 8px bound so a row visible at 8px but not 24px still reaches onRow', () => {
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    // Row 0: 10 Mpc — beyond the would-be 24-px bound (5 Mpc) but inside the
    // 8-px bound (15 Mpc); px = 12, squarely between the two thresholds.
    // Row 1: 20 Mpc — beyond even the 8-px bound; the early-out must drop it.
    const catalogs = new Map<SourceType, GalaxyCatalog>([
      [
        Source.SDSS,
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
    const catalogs = new Map<SourceType, GalaxyCatalog>([
      [Source.SDSS, makeCatalog([{ distMpc: 10, diameterKpc: 5 }])],
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
    const catalogs = new Map<SourceType, GalaxyCatalog>([[Source.SDSS, makeCatalog(rows)]]);

    const proceduralEvents: WalkEvent[] = [];
    const texturedEvents: WalkEvent[] = [];
    const procedural = recordingVisitor(proceduralEvents);
    const textured = recordingVisitor(texturedEvents);

    const windowsOf = (events: WalkEvent[]) =>
      events.filter((e) => e[0] === 'beginSource').map((e) => [e[2], e[3]]);

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
    // module-header worked example above) — a narrow-FOV pxPerRad would admit
    // a catalog this size in full without the budget.
    const rowCount = DISK_ROW_ACCEPT_BUDGET * 4;
    const rows = Array.from({ length: rowCount }, () => ({ distMpc: 1, diameterKpc: 50 }));
    const catalogs = new Map<SourceType, GalaxyCatalog>([[Source.SDSS, makeCatalog(rows)]]);
    const events: WalkEvent[] = [];
    walk.runFrame(makeInput(catalogs), recordingVisitor(events), noopDiskRowVisitor());
    const onRowCount = events.filter((e) => e[0] === 'onRow').length;
    expect(onRowCount).toBe(DISK_ROW_ACCEPT_BUDGET);
  });
});
