/**
 * dissolveCatalogBuffer — the tier-swap pre-replace dissolve.
 *
 * A thin, awaited fade-to-zero on the catalog's own FadeId. These tests pin
 * the two things callers rely on: it targets the right handle at the
 * fade-OUT duration, and it AWAITS the ramp (so the slot commit can sequence
 * `upload()` strictly after the dissolve completes — one buffer per catalog
 * means old and new can't cross-fade).
 */

import { describe, it, expect, vi } from 'vitest';
import { dissolveCatalogBuffer } from '../../../../src/services/engine/wiring/dissolveCatalogBuffer';
import { FADE_OUT_DURATION_MS } from '../../../../src/services/animation/fadeController';
import type { FadeId } from '../../../../src/@types/animation/FadeId';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

function makeState(fadeTo: (id: FadeId, target: number, duration: number) => Promise<void>) {
  return {
    subsystems: { fades: { fadeTo } },
  } as unknown as Pick<EngineState, 'subsystems'>;
}

describe('dissolveCatalogBuffer', () => {
  it('fades the catalog handle to 0 over FADE_OUT_DURATION_MS', async () => {
    const fadeTo = vi.fn<(id: FadeId, target: number, duration: number) => Promise<void>>(
      () => Promise.resolve(),
    );
    await dissolveCatalogBuffer(makeState(fadeTo), 'sdss');

    expect(fadeTo).toHaveBeenCalledOnce();
    expect(fadeTo).toHaveBeenCalledWith(
      { kind: 'galaxyCatalog', id: 'sdss' },
      0,
      FADE_OUT_DURATION_MS,
    );
  });

  it('awaits the fade ramp (resolves only after fadeTo settles)', async () => {
    let settled = false;
    const fadeTo = vi.fn<(id: FadeId, target: number, duration: number) => Promise<void>>(
      () =>
        new Promise<void>((resolve) =>
          queueMicrotask(() => {
            settled = true;
            resolve();
          }),
        ),
    );

    const done = dissolveCatalogBuffer(makeState(fadeTo), 'glade');
    expect(settled).toBe(false); // not yet — the fade is in flight
    await done;
    expect(settled).toBe(true); // the caller's await saw the ramp finish
  });
});
