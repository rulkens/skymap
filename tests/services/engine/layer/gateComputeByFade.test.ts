import { describe, expect, it, vi } from 'vitest';

import { APP_VISIBILITY_REGISTRY } from '../../../../src/compositions/appVisibility';
import { createFadeRegistry } from '../../../../src/services/animation/fadeRegistry';
import { gateComputeByFade } from '../../../../src/services/engine/layer/gateComputeByFade';
import type { ContentCompute } from '../../../../src/@types/engine/frame/ContentCompute';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { PassState } from '../../../../src/@types/engine/frame/PassState';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

const at = (distanceMpc: number) =>
  ({ drawCamPos: [distanceMpc, 0, 0], snapshot: { nowMs: 0 } }) as unknown as FrameView;

// Pins that a once-scope compute sees its entry's distance band: without it the flow
// integrator keeps dispatching at home, where its ribbons are banded to nothing.
describe('gateComputeByFade', () => {
  it('hands a once-scope compute its band at the view it is encoded with', () => {
    const fades = createFadeRegistry({ requestRender: () => {} });
    fades.register({ address: 'flow' }, 1);
    const state = {
      subsystems: { fades, clipPlayer: { clipOpacityOf: () => 1 } },
      visibilityEntries: APP_VISIBILITY_REGISTRY,
    } as unknown as EngineState;
    const encode = vi.fn();
    const compute: ContentCompute<'flow'> = { name: 'c', scope: 'once', fade: 'flow', encode };
    const gated = gateComputeByFade(compute as ContentCompute, state);
    const encoder = {} as GPUCommandEncoder;
    const claim = () => ({});

    gated.encode(encoder, at(0), {} as PassState, claim);
    gated.encode(encoder, at(10), {} as PassState, claim);

    expect(encode.mock.calls.map((call) => call[4])).toEqual([0, 1]);
  });
});
