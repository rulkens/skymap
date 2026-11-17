import { describe, expect, it } from 'vitest';

import { SITE_SHOTS } from '../../../packages/website/src/data/siteShots';
import { FRAME_ORDER_PASS_NAMES } from '../../../src/services/engine/frame/frameOrderPassNames';
import { MATTE_HIDDEN_PASSES } from '../../../tools/site/matteHiddenPasses';

// A misspelt pass hides nothing and leaves its sky or body in the cut-out, with no error.
describe('matte pass names', () => {
  it('every pass a matte hides is a pass a FRAME_ORDER line draws', () => {
    const named = [
      ...MATTE_HIDDEN_PASSES,
      ...SITE_SHOTS.flatMap((s) => [
        ...(s.settings?.hidePasses ?? []),
        ...(s.settings?.keepPasses ?? []),
      ]),
    ];
    for (const pass of named) expect(FRAME_ORDER_PASS_NAMES).toContain(pass);
  });
});
