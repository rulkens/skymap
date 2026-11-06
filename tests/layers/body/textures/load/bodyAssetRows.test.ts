/**
 * bodyAssetRows — the body Layer's texture rows: one per `(body, kind)` key, each
 * handing back the runtime's own slot, with the proximity demand/release pair
 * exercised against a stub `DemandCtx`.
 */

import { describe, it, expect } from 'vitest';
import { evaluateAssetDemand } from '../../../../../src/services/engine/wiring/evaluateAssetDemand';
import { bodyAssetRows } from '../../../../../src/layers/body/textures/load/bodyAssetRows';
import { ALL_BODY_TEXTURE_KEYS } from '../../../../../src/layers/body/textures/data/bodyTextureKeys';
import { loadRadiusMpc } from '../../../../../src/layers/body/textures/load/bodyTextureLoadRadius';
import { distanceMpc } from '../../../../../src/utils/math/distanceMpc';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { hostBodyId } from '../../../../../src/layers/body/textures/present/hostBodyId';
import { bodyTextureSlotKey } from '../../../../../src/layers/body/textures/load/bodyTextureSlotKey';
import { asSceneBodyId } from '../../../../../src/utils/scene/asSceneBodyId';
import type { AssetKey } from '../../../../../src/@types/loading/AssetKey';
import type { DemandCtx } from '../../../../../src/@types/loading/DemandCtx';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import type { BodyRuntime } from '../../../../../src/layers/body/@types/BodyRuntime';

const SLOTS = new Map(
  ALL_BODY_TEXTURE_KEYS.map((e) => {
    const key = bodyTextureSlotKey(e.bodyId, e.kind);
    return [key, { name: key }] as const;
  }),
);
const ROWS = bodyAssetRows({ textureSlots: SLOTS, atlasSlot: {} } as unknown as BodyRuntime);

function rowFor(key: AssetKey) {
  const r = ROWS.find((row) => row.key === key);
  if (!r) throw new Error(`no body asset row for key ${String(key)}`);
  return r;
}

function makeCtx(over: { cameraPosMpc: Vec3; simDays?: number }): DemandCtx {
  return {
    cameraPosMpc: over.cameraPosMpc,
    simDays: over.simDays ?? CONST_J2000,
  } as unknown as DemandCtx;
}

/**
 * Where a body-texture key's proximity gate is measured from. Host bodies move, so the
 * position comes from the derived snapshot at `simDays`, the source the rows read.
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
    // `demand` fires inside X, `release` outside 2X; between them neither fires, a gap
    // `!demand` could not encode, so a camera at the boundary never thrashes the multi-MB
    // texture load/free cycle.
    const earth = rowFor('earth:surface');
    const pos = bodyPosOf('earth');
    const r = loadRadiusMpc('earth');
    const at = (d: number): Vec3 => [pos[0] + d, pos[1], pos[2]];

    const inside = makeCtx({ cameraPosMpc: at(0.5 * r) });
    expect(evaluateAssetDemand(earth, inside, []).demand).toBe(true);
    expect(evaluateAssetDemand(earth, inside, []).release).toBe(false);

    const band = makeCtx({ cameraPosMpc: at(1.5 * r) });
    expect(evaluateAssetDemand(earth, band, []).demand).toBe(false);
    expect(evaluateAssetDemand(earth, band, []).release).toBe(false);

    const beyond = makeCtx({ cameraPosMpc: at(2.5 * r) });
    expect(evaluateAssetDemand(earth, beyond, []).demand).toBe(false);
    expect(evaluateAssetDemand(earth, beyond, []).release).toBe(true);
  });

  it('body-texture proximity gate reflects the LIVE snapshot position, not J2000', () => {
    // A host body moves with the clock: the gate must measure against the body at
    // `ctx.simDays`, not J2000 — a gate still reading J2000 fails both arms.
    const earth = rowFor('earth:surface');
    const simDays = CONST_J2000 + 120; // ~1/3 of an Earth year on
    const livePos = bodyPosOf('earth', simDays);
    const j2000Pos = bodyPosOf('earth', CONST_J2000);
    const r = loadRadiusMpc('earth');

    expect(distanceMpc(livePos, j2000Pos)).toBeGreaterThan(r);

    expect(
      evaluateAssetDemand(earth, makeCtx({ cameraPosMpc: [...livePos] as Vec3, simDays }), [])
        .demand,
    ).toBe(true);
    expect(
      evaluateAssetDemand(earth, makeCtx({ cameraPosMpc: [...j2000Pos] as Vec3, simDays }), [])
        .demand,
    ).toBe(false);
  });
});
