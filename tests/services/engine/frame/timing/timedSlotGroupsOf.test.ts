/**
 * timedSlotGroupsOf — bucketing an arbitrary expansion into display groups. The
 * real registry's grouped value is `timedSlotGroups.test.ts`'s.
 */

import { describe, it, expect, vi } from 'vitest';

import { timedSlotGroupsOf } from '../../../../../src/services/engine/frame/timing/timedSlotGroupsOf';
import { expandFrameOrder } from '../../../../../src/services/engine/frame/expandFrameOrder';
import { COSMO, NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import type { ContentPass } from '../../../../../src/@types/engine/frame/ContentPass';
import type { FrameStep } from '../../../../../src/@types/engine/frame/FrameStep';
import type { FrameStepSpec } from '../../../../../src/@types/engine/frame/FrameStepSpec';
import type { ToneMap } from '../../../../../src/@types/rendering/ToneMap';

const TONE: ToneMap = { exposure: 1.5, curve: 4, hdrKnee: 0, hdrHeadroom: 0 };

/** A minimal `ContentPass` fixture — the derivations read only `name`. */
function fakePass(name: string): ContentPass {
  return {
    name,
    enabled: vi.fn<ContentPass['enabled']>(() => true),
    draw: vi.fn<ContentPass['draw']>(),
  };
}

describe('timedSlotGroupsOf', () => {
  it('gives a body-family pass a distinct row per body index, keyed by its slab (M2 fix)', () => {
    // A pass drawn on every body row must contribute TWO distinctly-NAMED
    // 'planets·BODY[k]' rows, not one collapsed 'planets' row: the underlying
    // GPU timing indexes solely by name (`buildTimingSlotMap`), so two
    // same-named passes in one encoder would both write the SAME two query
    // indices and the reported figure would be whichever resolved last —
    // under-reporting a multi-body scene by a factor of N.
    const order: readonly FrameStepSpec[] = [
      {
        kind: 'foreground',
        target: 'foreground:0',
        near0Passes: [],
        bodyPasses: ['planets'],
      },
    ];
    const groups = timedSlotGroupsOf(
      expandFrameOrder(order, [fakePass('planets')], {
        tone: TONE,
        bloomEnabled: false,
        foregroundChain: [NEAR0, 2, 3],
        skyCubemapFacesToCapture: [],
        lensBodySlabs: [],
      }),
    );
    const foreground = groups.find((g) => g.title === 'Foreground bodies · depth')!;
    // The NEAR0 chain entry resolves an empty roster and so emits no step at all.
    expect(foreground.rows.map((r) => r.name)).toEqual([
      'planets·BODY[0]',
      'foreground:0·BODY[0]',
      'planets·BODY[1]',
      'foreground:0·BODY[1]',
    ]);
  });

  it('falls back to the raw groupKey as the title for an unmapped (target, slab) step', () => {
    // A genuinely new render target/slab the title table doesn't know: the group
    // still forms (self-maintaining), titled with the raw key rather than
    // vanishing. Known titles hold their fixed positions; the unmapped fallback
    // appends after them (a nudge to give it a real title).
    const steps: readonly FrameStep[] = [
      { kind: 'render', target: 'foo', slab: COSMO, passes: [fakePass('x')] },
    ];
    const groups = timedSlotGroupsOf(steps);
    expect(groups.map((g) => g.title)).toEqual(['Composites & pick', 'foo·COSMO']);
    const fallback = groups.find((g) => g.title === 'foo·COSMO')!;
    // The pass row, then the step's own group-key row (name === groupKey).
    expect(fallback.rows).toEqual([
      { name: 'x', groupKey: 'foo·COSMO' },
      { name: 'foo·COSMO', groupKey: 'foo·COSMO' },
    ]);
  });
});
