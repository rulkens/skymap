import { describe, it, expect } from 'vitest';
import { meshPresentationsOf } from '../../../src/utils/meshBodies/meshPresentationsOf';
import type { LayerBody } from '../../../src/@types/engine/layer/LayerBody';

const PLAIN = { body: { id: 'rock', resolvePx: 16 } } as unknown as LayerBody;
const SHAPED = {
  body: { id: 'moonlet', resolvePx: 3 },
  shapeModel: { meshKey: 'moonlet', boundingRadiusM: 1200, tierCeiling: 'medium' },
} as unknown as LayerBody;
const MESH = {
  body: { id: 'probe', meshKey: 'probe-hull', boundingRadiusM: 2, resolvePx: 3 },
} as unknown as LayerBody;

describe('meshPresentationsOf', () => {
  // Order is load-bearing: slot keys and queue ties follow it.
  it('lists mesh bodies, then shape-model bodies, and skips plain rows', () => {
    const rows = meshPresentationsOf([SHAPED, PLAIN, MESH]);
    expect(rows.map((row) => row.id)).toEqual(['probe', 'moonlet']);
    expect(rows[1]).toEqual({
      id: 'moonlet',
      meshKey: 'moonlet',
      boundingRadiusM: 1200,
      tierCeiling: 'medium',
      resolvePx: 3,
    });
  });
});
