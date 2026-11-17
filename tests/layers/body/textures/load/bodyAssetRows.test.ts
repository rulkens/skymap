/**
 * bodyAssetRows — the body Layer's texture rows: one per `(body, kind)` key, each
 * handing back the runtime's own slot. Demand is proven at poses in `demandAtPoses.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { bodyAssetRows } from '../../../../../src/layers/body/textures/load/bodyAssetRows';
import { ALL_BODY_TEXTURE_KEYS } from '../../../../../src/layers/body/textures/data/bodyTextureKeys';
import { bodyTextureSlotKey } from '../../../../../src/layers/body/textures/load/bodyTextureSlotKey';
import type { AssetKey } from '../../../../../src/@types/loading/AssetKey';
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
