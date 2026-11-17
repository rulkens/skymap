import { describe, expect, it } from 'vitest';

import { stellarStreamsLayer } from '../../../src/layers/stellarStreams/layer';
import { FRAME_ORDER_PASS_NAMES } from '../../../src/services/engine/frame/frameOrderPassNames';
import type { StellarStreamsRuntime } from '../../../src/layers/stellarStreams/@types/StellarStreamsRuntime';

describe('stellarStreams layer', () => {
  it("the Layer's pass sits on a FRAME_ORDER line", () => {
    const names = stellarStreamsLayer.passes({} as StellarStreamsRuntime).map((pass) => pass.name);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(FRAME_ORDER_PASS_NAMES, name).toContain(name);
  });
});
