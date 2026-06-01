/**
 * registerOverlayFades — unit tests for the overlay/volume/label fade-handle
 * registration extracted from wireSlots.
 *
 * Three invariants targeted:
 *
 *   1. The three overlay handles (milkyWay, proceduralDisks, texturedDisks)
 *      are registered with settings-derived or fixed opacities.  milkyWay is
 *      the load-bearing case: the initial opacity must reflect the user's
 *      stored setting so a default-off session doesn't flash the Milky Way
 *      on frame 1.
 *
 *   2. The volumesMaster handle is registered at settings.volumes.masterEnabled
 *      so a default-off session sits at 0 until toggled, and a default-on
 *      session starts drawing volumes from the first frame.
 *
 *   3. The four label-layer handles (youAreHere, poi, galaxyNames, scaleBar)
 *      are registered with the correct initial opacities: the first three at
 *      0 (their producers fire fadeTo(1) on first non-empty emit), scaleBar
 *      at 1 (React-side, tour-addressable but never auto-faded by the engine).
 *
 * Mocking strategy: spy on `state.subsystems.fades.register`; inject a
 * minimal `state` with only the settings paths the function reads.  No GPU
 * resources are needed — the function does not touch `state.gpu`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FadeHandle } from '../../../../src/@types/animation/FadeHandle';

// Import AFTER describing mocks (none needed here — no GPU factories called).
import { registerOverlayFades } from '../../../../src/services/engine/wiring/registerOverlayFades';

// ── Helpers ───────────────────────────────────────────────────────────

type RegisterCall = [FadeHandle, number | undefined];

/**
 * Build a minimal EngineState with only the fields registerOverlayFades reads:
 * `state.settings.milkyWay.enabled`, `state.settings.volumes.masterEnabled`,
 * and `state.subsystems.fades.register`.
 */
function makeState(opts: {
  milkyWayEnabled?: boolean;
  volumesMasterEnabled?: boolean;
} = {}): { state: EngineState; registerSpy: ReturnType<typeof vi.fn> } {
  const registerSpy = vi.fn();
  const state = {
    settings: {
      milkyWay: { enabled: opts.milkyWayEnabled ?? true },
      volumes: { masterEnabled: opts.volumesMasterEnabled ?? true },
    },
    subsystems: {
      fades: { register: registerSpy },
    },
  } as unknown as EngineState;
  return { state, registerSpy };
}

/** Extract all register calls as [handle, opacity] pairs. */
function calls(spy: ReturnType<typeof vi.fn>): RegisterCall[] {
  return spy.mock.calls as RegisterCall[];
}

// ── Tests ────────────────────────────────────────────────────────────

describe('registerOverlayFades', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── milkyWay gating ──────────────────────────────────────────────

  it('registers milkyWay at 1 when settings.milkyWay.enabled', () => {
    // When the user has milkyWay on, the initial fade-registry opacity must
    // be 1 so the overlay draws from frame 1 without waiting for a fadeTo.
    const { state, registerSpy } = makeState({ milkyWayEnabled: true });
    registerOverlayFades(state);

    const milkyWayCall = calls(registerSpy).find(
      ([h]) => h.kind === 'overlay' && (h as Extract<typeof h, { id: string }>).id === 'milkyWay',
    );
    expect(milkyWayCall).toBeDefined();
    expect(milkyWayCall![1]).toBe(1);
  });

  it('registers milkyWay at 0 when disabled', () => {
    // A default-off session must not flash the Milky Way on frame 1.
    // The toggle path multiplies the registered opacity into the renderer's
    // distance-based fadeAlpha — always registering at 1 would defeat the
    // toggle before any setImmediate fires.
    const { state, registerSpy } = makeState({ milkyWayEnabled: false });
    registerOverlayFades(state);

    const milkyWayCall = calls(registerSpy).find(
      ([h]) => h.kind === 'overlay' && (h as Extract<typeof h, { id: string }>).id === 'milkyWay',
    );
    expect(milkyWayCall).toBeDefined();
    expect(milkyWayCall![1]).toBe(0);
  });

  // ── proceduralDisks + texturedDisks ──────────────────────────────

  it('registers proceduralDisks and texturedDisks at 1', () => {
    // Both disk overlays are always-on at boot — their LOD planners gate
    // visibility by apparent galaxy size rather than by a fade-registry opacity.
    const { state, registerSpy } = makeState();
    registerOverlayFades(state);

    const procCall = calls(registerSpy).find(
      ([h]) =>
        h.kind === 'overlay' &&
        (h as Extract<typeof h, { id: string }>).id === 'proceduralDisks',
    );
    const textCall = calls(registerSpy).find(
      ([h]) =>
        h.kind === 'overlay' &&
        (h as Extract<typeof h, { id: string }>).id === 'texturedDisks',
    );
    expect(procCall).toBeDefined();
    expect(procCall![1]).toBe(1);
    expect(textCall).toBeDefined();
    expect(textCall![1]).toBe(1);
  });

  // ── volumesMaster gating ─────────────────────────────────────────

  it('registers volumesMaster at 1 when settings.volumes.masterEnabled', () => {
    // A default-on session needs opacity 1 from frame 1 so the
    // encodeHdr* volume multipliers don't accidentally suppress rendering.
    const { state, registerSpy } = makeState({ volumesMasterEnabled: true });
    registerOverlayFades(state);

    const masterCall = calls(registerSpy).find(([h]) => h.kind === 'volumesMaster');
    expect(masterCall).toBeDefined();
    expect(masterCall![1]).toBe(1);
  });

  it('registers volumesMaster at 0 when settings.volumes.masterEnabled is false', () => {
    // A default-off session sits at 0; setVolumesEnabled fires fadeTo(1)
    // when the user toggles the master switch.
    const { state, registerSpy } = makeState({ volumesMasterEnabled: false });
    registerOverlayFades(state);

    const masterCall = calls(registerSpy).find(([h]) => h.kind === 'volumesMaster');
    expect(masterCall).toBeDefined();
    expect(masterCall![1]).toBe(0);
  });

  // ── label-layer handles ──────────────────────────────────────────

  it('registers the four label-layer handles at 0,0,0,1', () => {
    // youAreHere / poi / galaxyNames start at 0: their subsystem producers
    // fire fadeTo(1) on the first non-empty emit, so a premature 1 would
    // flash empty label layers before any data has landed.
    // scaleBar is React-side and tour-addressable but never auto-faded by
    // the engine, so it starts at 1.
    const { state, registerSpy } = makeState();
    registerOverlayFades(state);

    type LabelCall = [Extract<FadeHandle, { kind: 'labelLayer' }>, number | undefined];
    const labelCalls = calls(registerSpy).filter(([h]) => h.kind === 'labelLayer') as LabelCall[];
    const byLayer = Object.fromEntries(labelCalls.map(([h, op]) => [h.layer, op]));

    expect(byLayer['youAreHere']).toBe(0);
    expect(byLayer['poi']).toBe(0);
    expect(byLayer['galaxyNames']).toBe(0);
    expect(byLayer['scaleBar']).toBe(1);
  });
});
