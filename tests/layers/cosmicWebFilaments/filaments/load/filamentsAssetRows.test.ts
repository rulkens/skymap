/**
 * filamentsAssetRows — the Layer's one row's request builder.
 */

import { describe, it, expect } from 'vitest';

import { filamentsAssetRows } from '../../../../../src/layers/cosmicWebFilaments/filaments/load/filamentsAssetRows';
import { sameRequest } from '../../../../../src/utils/loading/sameRequest';
import type { CosmicWebFilamentsRuntime } from '../../../../../src/layers/cosmicWebFilaments/@types/CosmicWebFilamentsRuntime';

// The row reads neither the renderer nor the slot — only `factory` closes over
// the runtime, and nothing here calls it.
const ROW = filamentsAssetRows({} as CosmicWebFilamentsRuntime)[0]!;

describe('filamentsAssetRows', () => {
  it('the request drifts only across the small boundary', () => {
    // Polarity, not just drift: a flipped flag would fetch the wrong file at
    // every tier while keeping the drift assertions below green.
    expect(ROW.req('small')).toEqual({ small: true });
    expect(ROW.req('large')).toEqual({ small: false });
    expect(sameRequest(ROW.req('medium'), ROW.req('large'))).toBe(true);
    expect(sameRequest(ROW.req('small'), ROW.req('medium'))).toBe(false);
  });
});
