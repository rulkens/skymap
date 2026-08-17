import { describe, expect, it, vi } from 'vitest';
import {
  FILAMENT_RECESSION,
  LABEL_RECESSION,
  MARKER_RECESSION,
  VOLUME_RECESSION,
  focusRecession,
  recessionTargetFor,
  resolveLayerOpacity,
} from '../../../../src/services/engine/presentation/focusRecession';
import { createFadeRegistry } from '../../../../src/services/animation/fadeRegistry';
import { lerp } from '../../../../src/utils/math/lerp';
import type { ClipPlayer } from '../../../../src/@types/engine/subsystems/ClipPlayer';
import type { VisibilityLayerKey } from '../../../../src/@types/animation/VisibilityLayerKey';

function makeRegistry() {
  return createFadeRegistry({ requestRender: () => {} });
}

/**
 * Build a minimal ClipPlayer stub: `clipOpacityOf` returns `factor` for every
 * call; `tick`, `stop`, `registerEndResolver`, and `destroy` are no-ops. Typed
 * to satisfy `ClipPlayer` without bare `vi.fn()` (bare fails tsc against typed
 * callback fields).
 */
function makeClipPlayer(factor: number): ClipPlayer {
  return {
    tick: vi.fn<(nowMs: number) => void>(),
    stop: vi.fn<() => void>(),
    registerEndResolver: vi.fn<(onEnd: () => void) => void>(),
    clipOpacityOf: vi.fn<(layer: VisibilityLayerKey, nowMs: number) => number>(() => factor),
    destroy: vi.fn<() => void>(),
  };
}

import type { StructureId } from '../../../../src/@types/data/structure/StructureId';

describe('focusRecession', () => {
  it('returns 1.0 for an untagged handle at blend 0', () => {
    expect(focusRecession({ kind: 'galaxyCatalog', id: 'sdss' }, 0)).toBe(1);
  });

  it('returns 1.0 for an untagged handle at blend 1', () => {
    // Galaxy catalog handles have no recession target — they never recede, at any blend.
    expect(focusRecession({ kind: 'galaxyCatalog', id: 'sdss' }, 1)).toBe(1);
  });

  it('returns 1.0 for a tagged handle at blend 0', () => {
    // Unfocused is full opacity even for a recession-tagged layer.
    expect(focusRecession({ kind: 'filament' }, 0)).toBe(1);
  });

  it('returns the exact target for a tagged handle at blend 1', () => {
    expect(focusRecession({ kind: 'filament' }, 1)).toBe(FILAMENT_RECESSION);
  });

  it('lerps a tagged handle at intermediate blend', () => {
    expect(focusRecession({ kind: 'filament' }, 0.5)).toBe(lerp(1, FILAMENT_RECESSION, 0.5));
  });
});

describe('recessionTargetFor', () => {
  it('tags structure for every id', () => {
    const ids: StructureId[] = ['cluster', 'supercluster', 'void', 'group'];
    for (const id of ids) {
      expect(recessionTargetFor({ kind: 'structure', id })).toBe(MARKER_RECESSION);
    }
  });

  it('tags filament and volumesMaster — the diffuse fields the HDR encoders recede', () => {
    // The two ambient subsystems routed through the HDR encoders / filament
    // pass at the call site. Both recede to the same diffuse-field target.
    expect(recessionTargetFor({ kind: 'filament' })).toBe(FILAMENT_RECESSION);
    expect(recessionTargetFor({ kind: 'volumesMaster' })).toBe(VOLUME_RECESSION);
  });

  it('does not recede the milky-way disk', () => {
    expect(recessionTargetFor({ kind: 'milkyWay' })).toBeUndefined();
  });

  it('tags structure and galaxy labels but not milkyWay or scaleBar', () => {
    expect(recessionTargetFor({ kind: 'labelLayer', layer: 'structure' })).toBe(LABEL_RECESSION);
    expect(recessionTargetFor({ kind: 'labelLayer', layer: 'galaxy' })).toBe(LABEL_RECESSION);
    expect(recessionTargetFor({ kind: 'labelLayer', layer: 'milkyWay' })).toBeUndefined();
    expect(recessionTargetFor({ kind: 'labelLayer', layer: 'scaleBar' })).toBeUndefined();
  });
});

describe('resolveLayerOpacity', () => {
  it('multiplies opacityOf by focusRecession', () => {
    const fades = makeRegistry();
    const handle = { kind: 'filament' } as const;
    // Register at 0 then snap to a known toggle opacity at now=0. fadeTo with
    // duration 0 lands the controller exactly on the target immediately.
    fades.register(handle, 0);
    fades.fadeTo(handle, 0.5, 0, 0);

    // toggle 0.5 × recession (full focus → FILAMENT_RECESSION).
    expect(resolveLayerOpacity(fades, handle, 1, 0)).toBe(0.5 * FILAMENT_RECESSION);
  });

  it('returns 0 when the toggle is 0 regardless of blend', () => {
    const fades = makeRegistry();
    const handle = { kind: 'filament' } as const;
    fades.register(handle, 0); // toggle opacity 0

    // 0 × anything = 0, at any blend.
    expect(resolveLayerOpacity(fades, handle, 0, 0)).toBe(0);
    expect(resolveLayerOpacity(fades, handle, 1, 0)).toBe(0);
  });

  // ── Clip factor tests (Task 12) ─────────────────────────────────────────

  it('omitting the clip channel leaves opacity unchanged (back-compat)', () => {
    // The clip arg is optional. All existing callers that omit it must
    // see the exact same result as before — factor 1 is the default.
    const fades = makeRegistry();
    const handle = { kind: 'filament' } as const;
    fades.register(handle, 0);
    fades.fadeTo(handle, 0.6, 0, 0);

    // No clip arg: toggle × recession only.
    const withoutClip = resolveLayerOpacity(fades, handle, 0.5, 0);
    // Explicit clip that always returns 1 must give the same result.
    const clipAtOne = makeClipPlayer(1);
    const withClipOne = resolveLayerOpacity(fades, handle, 0.5, 0, clipAtOne);
    expect(withClipOne).toBe(withoutClip);
  });

  it('includes the clip factor in the three-way product: intent × focus × clip', () => {
    // A clip player that halves every layer's opacity should halve the result
    // compared to omitting the clip channel.
    const fades = makeRegistry();
    const handle = { kind: 'filament' } as const;
    fades.register(handle, 0);
    fades.fadeTo(handle, 0.8, 0, 0); // toggle = 0.8

    const clipHalf = makeClipPlayer(0.5);
    // Expected: 0.8 × focusRecession({filament}, 0) × 0.5 = 0.8 × 1 × 0.5 = 0.4
    const result = resolveLayerOpacity(fades, handle, 0, 0, clipHalf);
    expect(result).toBeCloseTo(0.8 * 1 * 0.5);
  });

  it('uses factor 1 for a FadeId with no clip key even with a channel present', () => {
    // `overlay` has no VisibilityLayerKey mapping — fadeIdToVisibilityKey returns
    // undefined, and clipFactorFor returns 1. The clip player must NOT be called
    // with an undefined key; the caller gates it.
    const fades = makeRegistry();
    const handle = { kind: 'overlay', id: 'proceduralDisks' } as const;
    fades.register(handle, 0);
    fades.fadeTo(handle, 1.0, 0, 0);

    const clipFactor = 0.3; // if the factor leaked through, the result would be 0.3
    const clip = makeClipPlayer(clipFactor);
    // overlay has no recession target (factor 1) and no clip key (factor 1).
    // Result: 1.0 × 1 × 1 = 1.0.
    const result = resolveLayerOpacity(fades, handle, 1, 0, clip);
    expect(result).toBe(1);
  });
});
