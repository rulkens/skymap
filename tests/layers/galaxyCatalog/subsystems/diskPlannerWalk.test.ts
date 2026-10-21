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
 *   - a block no row of which can reach the disk size is not walked at all, and
 *     leaves no sticky disks behind
 */

import { describe, it, expect } from 'vitest';
import { Source } from '../../../../src/data/sources';
import {
  createDiskPlannerWalk,
  DISK_ROW_ACCEPT_BUDGET,
} from '../../../../src/layers/galaxyCatalog/subsystems/diskPlannerWalk';
import { noopDiskRowVisitor } from '../../../services/engine/subsystems/diskWalkHarness';
import type { DiskRowVisitor } from '../../../../src/@types/engine/subsystems/DiskRowVisitor';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import { makeGalaxyCatalog } from '../../../fixtures/makeGalaxyCatalog';
import { galaxyRecordsOver } from '../../../support/galaxyRecordsOver';

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
  return {
    cam: makeCam(),
    records: galaxyRecordsOver(catalogs),
    sourceMask: mask,
    pxPerRad: PX_PER_RAD,
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
      ['beginBlock', Source.SDSS, 0, 3],
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
    // sub-threshold rows is the BODY's decision inside onRow. Its block holds
    // one row that reaches 12 px, so the block is in reach.
    const catalogs = new Map<SourceType, GalaxyCatalog>([
      [
        Source.SDSS,
        makeCatalog([
          { distMpc: 10, diameterKpc: 5 },
          { distMpc: 10, diameterKpc: 200 },
        ]),
      ],
    ]);
    const rows: { i: number; camDist: number; px: number }[] = [];
    walk.runFrame(makeInput(catalogs), rowCapturingVisitor(rows), noopDiskRowVisitor());
    expect(rows.length).toBe(2);
    expect(rows[0]!.px).toBeCloseTo(0.3, 5);
    expect(rows[0]!.px).toBeLessThan(8);
  });

  it('a block no row of which can reach 8 px is not walked: no hooks, no row read after its first frame', () => {
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    // 50 kpc reaches 8 px out to (0.05 · 600) / 8 = 3.75 Mpc; these rows sit at 5–6 Mpc, inside
    // the walk's own 200-kpc bound (15 Mpc), so only the block's largest diameter rules them out.
    const catalog = makeCatalog([
      { distMpc: 5, diameterKpc: 50 },
      { distMpc: 6, diameterKpc: 20 },
    ]);
    let reads = 0;
    catalog.positions = new Proxy(catalog.positions, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++;
        const v = Reflect.get(target, key, target);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    const input = makeInput(new Map([[Source.Glade, catalog]]));
    const events: WalkEvent[] = [];
    walk.runFrame(input, recordingVisitor(events), noopDiskRowVisitor());
    reads = 0;
    walk.runFrame(input, recordingVisitor(events), noopDiskRowVisitor());
    expect(reads).toBe(0);
    expect(events.filter((e) => e[0] === 'beginBlock' || e[0] === 'onRow')).toEqual([]);
  });

  it('a block leaving reach purges its whole range once, and back in reach gets a whole pass', () => {
    const walk = createDiskPlannerWalk({ decimationFactor: 4 });
    const rows = Array.from({ length: 8 }, (_, i) => ({ distMpc: 1 + i / 10, diameterKpc: 50 }));
    const input = makeInput(new Map([[Source.Glade, makeCatalog(rows)]]));
    const events: WalkEvent[] = [];
    const frame = (camX: number) => {
      input.cam.position[0] = camX;
      walk.runFrame(input, recordingVisitor(events), noopDiskRowVisitor());
    };

    frame(0);
    frame(0);
    frame(-100); // every row ~100 Mpc away: out of reach
    frame(-100);
    frame(0);

    const windows = events.filter((e) => e[0] === 'beginBlock').map((e) => [e[2], e[3]]);
    expect(windows).toEqual([
      [0, 8],
      [0, 2],
      [0, 8],
      [0, 8],
    ]);
  });

  it("an evicted block's range is purged while another block sits out of reach", () => {
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    const flat = (rows: { distMpc: number; diameterKpc: number }[]) =>
      galaxyRecordsOver(new Map([[Source.Glade, makeCatalog(rows)]])).get(Source.Glade)!;
    const near = flat([{ distMpc: 1, diameterKpc: 50 }]);
    const far = flat([{ distMpc: 100, diameterKpc: 50 }]);
    let nearResident = true;
    const records = new Map([
      [
        Source.Glade,
        {
          ...near,
          forEachResidentBlock: (visit: Parameters<typeof near.forEachResidentBlock>[0]) => {
            if (nearResident) near.forEachResidentBlock((block) => visit(block, 0));
            far.forEachResidentBlock((block) => visit(block, 10));
            far.forEachResidentBlock((block) => visit(block, 20));
          },
        },
      ],
    ]);
    const input = { ...makeInput(new Map()), records };
    const events: WalkEvent[] = [];
    walk.runFrame(input, recordingVisitor(events), noopDiskRowVisitor());
    nearResident = false;
    events.length = 0;
    walk.runFrame(input, recordingVisitor(events), noopDiskRowVisitor());
    expect(events.filter((e) => e[0] === 'beginBlock')).toEqual([
      ['beginBlock', Source.Glade, 0, 1],
    ]);
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
      events.filter((e) => e[0] === 'beginBlock').map((e) => [e[2], e[3]]);

    walk.runFrame(makeInput(catalogs), procedural, textured);
    walk.runFrame(makeInput(catalogs), procedural, textured);
    walk.runFrame(makeInput(catalogs), procedural, textured);

    // Both slots see the SAME window each frame (one shared cursor, advanced
    // once per frame — not once per visitor); a block's first pass is whole.
    const windows = [
      [0, 4],
      [0, 2],
      [2, 4],
    ];
    expect(windowsOf(proceduralEvents)).toEqual(windows);
    expect(windowsOf(texturedEvents)).toEqual(windows);
  });

  it('caps rows admitted to onRow at DISK_ROW_ACCEPT_BUDGET per frame, even when every row in a huge window clears the distance gate', () => {
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    // Every row sits at 1 Mpc, well inside the 15 Mpc / 8-px bound (see the
    // worked example on `makeCatalog` above) — a narrow-FOV pxPerRad would
    // admit a catalog this size in full without the budget.
    const rowCount = DISK_ROW_ACCEPT_BUDGET * 4;
    const rows = Array.from({ length: rowCount }, () => ({ distMpc: 1, diameterKpc: 50 }));
    const catalogs = new Map<SourceType, GalaxyCatalog>([[Source.SDSS, makeCatalog(rows)]]);
    const events: WalkEvent[] = [];
    walk.runFrame(makeInput(catalogs), recordingVisitor(events), noopDiskRowVisitor());
    const onRowCount = events.filter((e) => e[0] === 'onRow').length;
    expect(onRowCount).toBe(DISK_ROW_ACCEPT_BUDGET);
  });

  it('rows below the 8-px fade start spend no budget, so a drawable row after many tiny ones still reaches onRow', () => {
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    // Tiny rows (px 0.3) clear the distance gate but neither body can draw them.
    const tiny = Array.from({ length: DISK_ROW_ACCEPT_BUDGET + 10 }, () => ({
      distMpc: 10,
      diameterKpc: 5,
    }));
    const catalogs = new Map<SourceType, GalaxyCatalog>([
      [Source.Glade, makeCatalog([...tiny, { distMpc: 1, diameterKpc: 50 }])],
    ]);
    const rows: { i: number; camDist: number; px: number }[] = [];
    walk.runFrame(makeInput(catalogs), rowCapturingVisitor(rows), noopDiskRowVisitor());
    expect(rows.some((r) => r.i === tiny.length)).toBe(true);
  });

  it('a block the spent budget skips keeps its window, so it is not starved on the same phase every cycle', () => {
    // Two blocks of one source: A spends the whole budget on every other frame, in phase with B's
    // windows. B's first row must still be visited.
    const walk = createDiskPlannerWalk({ decimationFactor: 2 });
    const a = makeCatalog([
      ...Array.from({ length: DISK_ROW_ACCEPT_BUDGET }, () => ({ distMpc: 1, diameterKpc: 50 })),
      ...Array.from({ length: DISK_ROW_ACCEPT_BUDGET }, () => ({ distMpc: 50, diameterKpc: 50 })),
    ]);
    const b = makeCatalog([
      { distMpc: 1, diameterKpc: 50 },
      { distMpc: 1, diameterKpc: 50 },
    ]);
    const base = galaxyRecordsOver(new Map([[Source.Glade, a]])).get(Source.Glade)!;
    const blockOf = (c: GalaxyCatalog) =>
      galaxyRecordsOver(new Map([[Source.Glade, c]])).get(Source.Glade)!;
    const records = new Map([
      [
        Source.Glade,
        {
          ...base,
          forEachResidentBlock: (visit: Parameters<typeof base.forEachResidentBlock>[0]) => {
            blockOf(a).forEachResidentBlock((block) => visit(block, 0));
            blockOf(b).forEachResidentBlock((block) => visit(block, 10_000));
          },
        },
      ],
    ]);
    const input = { ...makeInput(new Map()), records };
    const ordinals: number[] = [];
    let blockBase = 0;
    const visitor: DiskRowVisitor = {
      onSourceHidden() {},
      beginBlock(_s, _start, _end, ordinalBase) {
        blockBase = ordinalBase;
      },
      onRow: (_s, _block, i) => ordinals.push(blockBase + i),
      endSource() {},
      endFrame() {},
    };
    for (let f = 0; f < 6; f++) walk.runFrame(input, visitor, noopDiskRowVisitor());
    expect(ordinals).toContain(10_000);
    expect(ordinals).toContain(10_001);
  });

  it('the disk walk drops cursors of blocks no longer resident', () => {
    const walk = createDiskPlannerWalk({ decimationFactor: 4 });
    const rows = Array.from({ length: 8 }, (_, i) => ({ distMpc: 1 + i / 10, diameterKpc: 50 }));
    const flat = galaxyRecordsOver(new Map([[Source.Glade, makeCatalog(rows)]])).get(Source.Glade)!;
    // A chunk-like block at ordinal base 100 that is resident, then evicted, then back.
    let resident = true;
    const records = new Map([
      [
        Source.Glade,
        {
          ...flat,
          forEachResidentBlock: (visit: Parameters<typeof flat.forEachResidentBlock>[0]) => {
            if (resident) flat.forEachResidentBlock((block) => visit(block, 100));
          },
        },
      ],
    ]);
    const input = { ...makeInput(new Map()), records };
    const events: WalkEvent[] = [];
    const frame = () => walk.runFrame(input, recordingVisitor(events), noopDiskRowVisitor());

    frame();
    frame();
    resident = false;
    frame();
    resident = true;
    frame();

    // The eviction frame purges the block's whole range; back from eviction, the block
    // starts a fresh (whole) pass rather than resuming at row 2.
    const windows = events.filter((e) => e[0] === 'beginBlock').map((e) => [e[2], e[3]]);
    expect(windows).toEqual([
      [100, 108],
      [100, 102],
      [100, 108],
      [100, 108],
    ]);
  });

  it('a row with a NaN position (a blob) never reaches a visitor', () => {
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    const catalog = makeCatalog([
      { distMpc: 1, diameterKpc: 50 },
      { distMpc: 1.1, diameterKpc: 50 },
    ]);
    catalog.positions.fill(NaN, 3, 6);
    const events: WalkEvent[] = [];
    walk.runFrame(
      makeInput(new Map([[Source.Glade, catalog]])),
      recordingVisitor(events),
      noopDiskRowVisitor(),
    );
    expect(events.filter((e) => e[0] === 'onRow')).toEqual([['onRow', Source.Glade, 0]]);
  });
});
