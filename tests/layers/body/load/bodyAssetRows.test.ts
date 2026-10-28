/**
 * bodyAssetRows — the body Layer's texture rows: one per `(body, kind)` key, each
 * handing back the runtime's own slot, with the proximity demand/release pair
 * exercised against a stub `DemandCtx`.
 */

import { describe, it, expect } from 'vitest';
import { bodyAssetRows } from '../../../../src/layers/body/load/bodyAssetRows';
import { ALL_BODY_TEXTURE_KEYS } from '../../../../src/data/bodies/bodyTextureKeys';
import { loadRadiusMpc } from '../../../../src/layers/body/load/bodyTextureLoadRadius';
import { distanceMpc } from '../../../../src/utils/math/distanceMpc';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { hostBodyId } from '../../../../src/layers/body/present/hostBodyId';
import { bodyTextureSlotKey } from '../../../../src/utils/bodyTextures/bodyTextureSlotKey';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';
import type { AssetKey } from '../../../../src/@types/loading/AssetKey';
import type { DemandCtx } from '../../../../src/@types/loading/DemandCtx';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { BodyRuntime } from '../../../../src/layers/body/@types/BodyRuntime';

// One distinct stand-in per key, so a row handing back a neighbour's slot fails.
const SLOTS = new Map(
  ALL_BODY_TEXTURE_KEYS.map((e) => {
    const key = bodyTextureSlotKey(e.bodyId, e.kind);
    return [key, { name: key }] as const;
  }),
);
const ROWS = bodyAssetRows({ textureSlots: SLOTS, atlasSlot: {} } as unknown as BodyRuntime);

/** Find the single row for an asset key (throws if absent — keeps tests crisp). */
function rowFor(key: AssetKey) {
  const r = ROWS.find((row) => row.key === key);
  if (!r) throw new Error(`no body asset row for key ${String(key)}`);
  return r;
}

/** A stub DemandCtx: the rows read only the eye position and the sim instant. */
function makeCtx(over: { cameraPosMpc: Vec3; simDays?: number }): DemandCtx {
  return {
    cameraPosMpc: over.cameraPosMpc,
    simDays: over.simDays ?? CONST_J2000,
  } as unknown as DemandCtx;
}

/**
 * The world position a body-texture key's proximity gate is measured from at a
 * given sim instant. Host bodies are all orbital (textured planets / Earth /
 * moons) and MOVE, so their position comes from the derived snapshot at
 * `simDays` — the same source the rows read.
 */
function bodyPosOf(id: string, simDays: number = CONST_J2000): Readonly<Vec3> {
  return deriveBodyStates(simDays).get(asSceneBodyId(hostBodyId(id as never)))!.positionMpc;
}

describe('bodyAssetRows membership', () => {
  it("hands back the runtime's own slot for every texture key, with a tier-clamped request", () => {
    for (const entry of ALL_BODY_TEXTURE_KEYS) {
      const key = bodyTextureSlotKey(entry.bodyId, entry.kind);
      const row = rowFor(key);
      expect(row.slot).toBe(SLOTS.get(key));
      expect(row.req('large')).toMatchObject({ bodyId: entry.bodyId, kind: entry.kind });
    }
  });
});

describe('bodyAssetRows demand predicates', () => {
  it('body-texture rows encode load/evict hysteresis via demand vs release', () => {
    // Hand-place the camera along +x from a known body's position at three
    // distances relative to its load radius. `demand` fires inside X, `release`
    // fires outside 2X, and the band between is the hysteresis gap where NEITHER
    // fires — a gap `!demand` could not encode, so a camera dithering at the
    // boundary never thrashes the multi-MB texture load/free cycle.
    const earth = rowFor('earth:surface');
    const pos = bodyPosOf('earth');
    const r = loadRadiusMpc('earth');
    const at = (d: number): Vec3 => [pos[0] + d, pos[1], pos[2]];

    // (a) inside the load radius: demand true, release false.
    const inside = makeCtx({ cameraPosMpc: at(0.5 * r) });
    expect(earth.demand(inside)).toBe(true);
    expect(earth.release!(inside)).toBe(false);

    // (b) in the hysteresis band (between X and 2X): BOTH false.
    const band = makeCtx({ cameraPosMpc: at(1.5 * r) });
    expect(earth.demand(band)).toBe(false);
    expect(earth.release!(band)).toBe(false);

    // (c) beyond 2X: demand false, release true.
    const beyond = makeCtx({ cameraPosMpc: at(2.5 * r) });
    expect(earth.demand(beyond)).toBe(false);
    expect(earth.release!(beyond)).toBe(true);
  });

  it('body-texture proximity gate reflects the LIVE snapshot position, not J2000', () => {
    // A host body moves with the clock, so the gate must measure against where
    // the body sits at `ctx.simDays`, not the epoch. Pick an instant far enough
    // from J2000 that Earth has swung a good fraction of its orbit, so its
    // position differs by more than a load radius. Place the camera exactly at
    // the LIVE Earth position: the gate must demand there and NOT at the (now
    // distant) J2000 position — a gate still reading J2000 would fail both arms.
    const earth = rowFor('earth:surface');
    const simDays = CONST_J2000 + 120; // ~1/3 of an Earth year on
    const livePos = bodyPosOf('earth', simDays);
    const j2000Pos = bodyPosOf('earth', CONST_J2000);
    const r = loadRadiusMpc('earth');

    // Sanity: the two epochs are more than a load radius apart, else the test
    // proves nothing.
    expect(distanceMpc(livePos, j2000Pos)).toBeGreaterThan(r);

    // Camera at the live position, clock at the live instant ⇒ demanded.
    expect(earth.demand(makeCtx({ cameraPosMpc: [...livePos] as Vec3, simDays }))).toBe(true);
    // Same camera, but the gate reading J2000 would place the body a full orbit
    // arc away ⇒ NOT demanded. Passing the live simDays is what makes it fire.
    expect(earth.demand(makeCtx({ cameraPosMpc: [...j2000Pos] as Vec3, simDays }))).toBe(false);
  });
});
