/**
 * registerOverlayFades — unit tests for the overlay/volume/label fade-id
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
 *   2. The volumesMaster handle is registered at settings.volumes.enabled
 *      so a default-off session sits at 0 until toggled, and a default-on
 *      session starts drawing volumes from the first frame.
 *
 *   3. The four label-layer handles (milkyWay, structure, galaxyNames, scaleBar)
 *      are registered with the correct initial opacities: milkyWay at its
 *      persisted `settings.milkyWay.labelEnabled` (like the per-category
 *      structure handles), galaxyNames at 1 (famous labels reuse it), scaleBar
 *      at 1 (React-side, tour-addressable but never auto-faded by the engine).
 *
 * Mocking strategy: spy on `state.subsystems.fades.register`; inject a
 * minimal `state` with only the settings paths the function reads.  No GPU
 * resources are needed — the function does not touch `state.gpu`.
 */

import { describe, it, expect, vi } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FadeId } from '../../../../src/@types/animation/FadeId';

// Import AFTER describing mocks (none needed here — no GPU factories called).
import { registerOverlayFades } from '../../../../src/services/engine/wiring/registerOverlayFades';

// ── Helpers ───────────────────────────────────────────────────────────

type RegisterCall = [FadeId, number | undefined];

/**
 * Build a minimal EngineState with only the fields registerOverlayFades reads:
 * `state.settings.milkyWay.enabled`, `state.settings.milkyWay.labelEnabled`,
 * `state.settings.volumes.enabled`, and `state.subsystems.fades.register`.
 */
function makeState(
  opts: {
    milkyWayEnabled?: boolean;
    milkyWayLabelEnabled?: boolean;
    volumesMasterEnabled?: boolean;
    markerCategoryVisibility?: Partial<Record<string, boolean>>;
    labelCategoryVisibility?: Partial<Record<string, boolean>>;
  } = {},
): { state: EngineState; registerSpy: ReturnType<typeof vi.fn> } {
  const registerSpy = vi.fn();
  // Build the per-category item rows: every structure category defaults to
  // ring + label visible (true) unless the test overrides one axis. The marker
  // override flips `enabled`; the label override flips `labelEnabled`.
  const markerVis: Record<string, boolean> = {
    cluster: true,
    supercluster: true,
    void: true,
    group: true,
    ...opts.markerCategoryVisibility,
  };
  const labelVis: Record<string, boolean> = {
    cluster: true,
    supercluster: true,
    void: true,
    group: true,
    ...opts.labelCategoryVisibility,
  };
  const items: Record<string, { enabled: boolean; labelEnabled: boolean }> = {};
  for (const cat of ['cluster', 'supercluster', 'void', 'group']) {
    items[cat] = { enabled: markerVis[cat]!, labelEnabled: labelVis[cat]! };
  }
  const state = {
    settings: {
      milkyWay: {
        enabled: opts.milkyWayEnabled ?? true,
        labelEnabled: opts.milkyWayLabelEnabled ?? true,
      },
      volumes: { enabled: opts.volumesMasterEnabled ?? true },
      structures: { enabled: true, items },
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
  // Each test builds its own state + spy via makeState(); no shared mock state to reset.

  // ── milkyWay gating ──────────────────────────────────────────────

  it('registers milkyWay at 1 when settings.milkyWay.enabled', () => {
    // When the user has milkyWay on, the initial fade-registry opacity must
    // be 1 so the overlay draws from frame 1 without waiting for a fadeTo.
    const { state, registerSpy } = makeState({ milkyWayEnabled: true });
    registerOverlayFades(state);

    const milkyWayCall = calls(registerSpy).find(([h]) => h.kind === 'milkyWay');
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

    const milkyWayCall = calls(registerSpy).find(([h]) => h.kind === 'milkyWay');
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
        h.kind === 'overlay' && (h as Extract<typeof h, { id: string }>).id === 'proceduralDisks',
    );
    const textCall = calls(registerSpy).find(
      ([h]) =>
        h.kind === 'overlay' && (h as Extract<typeof h, { id: string }>).id === 'texturedDisks',
    );
    expect(procCall).toBeDefined();
    expect(procCall![1]).toBe(1);
    expect(textCall).toBeDefined();
    expect(textCall![1]).toBe(1);
  });

  // ── volumesMaster gating ─────────────────────────────────────────

  it('registers volumesMaster at 1 when settings.volumes.enabled', () => {
    // A default-on session needs opacity 1 from frame 1 so the
    // encodeHdr* volume multipliers don't accidentally suppress rendering.
    const { state, registerSpy } = makeState({ volumesMasterEnabled: true });
    registerOverlayFades(state);

    const masterCall = calls(registerSpy).find(([h]) => h.kind === 'volumesMaster');
    expect(masterCall).toBeDefined();
    expect(masterCall![1]).toBe(1);
  });

  it('registers volumesMaster at 0 when settings.volumes.enabled is false', () => {
    // A default-off session sits at 0; setVolumesEnabled fires fadeTo(1)
    // when the user toggles the master switch.
    const { state, registerSpy } = makeState({ volumesMasterEnabled: false });
    registerOverlayFades(state);

    const masterCall = calls(registerSpy).find(([h]) => h.kind === 'volumesMaster');
    expect(masterCall).toBeDefined();
    expect(masterCall![1]).toBe(0);
  });

  // ── label-layer handles ──────────────────────────────────────────

  it('registers the category-less label-layer handles (milkyWay from settings, galaxyNames + scaleBar fixed)', () => {
    // milkyWay is seeded from `settings.milkyWay.labelEnabled` (the persisted
    // toggle), exactly like the per-category structure label handles — the
    // default fixture has it on, so it registers at 1.  `produceMilkyWayLabel`
    // fires the load-in fadeTo on the first intended-visible emit.  galaxyNames
    // starts at 1 — famous-galaxy labels reuse that handle and consume its
    // opacity, so a 0 would make them invisible.  scaleBar is React-side and
    // tour-addressable but never auto-faded by the engine, so it starts at 1.
    // There is no category-less structure handle — structure labels use the
    // per-category structure handles and produceStructureLabels fires each
    // category's load-in.
    const { state, registerSpy } = makeState();
    registerOverlayFades(state);

    type LabelCall = [Extract<FadeId, { kind: 'labelLayer' }>, number | undefined];
    // Filter to category-LESS label handles only: there are multiple structure
    // labelLayer registrations (one per structure category), so collapsing by
    // `layer` alone would be ambiguous for structure.  The category-less handles are
    // exactly milkyWay/galaxyNames/scaleBar.
    const labelCalls = calls(registerSpy).filter(
      ([h]) => h.kind === 'labelLayer' && !(h as Extract<FadeId, { kind: 'labelLayer' }>).category,
    ) as LabelCall[];
    const byLayer = Object.fromEntries(labelCalls.map(([h, op]) => [h.layer, op]));

    expect(byLayer['milkyWay']).toBe(1);
    expect(byLayer['structure']).toBeUndefined();
    expect(byLayer['galaxyNames']).toBe(1);
    expect(byLayer['scaleBar']).toBe(1);
  });

  it('registers the milkyWay label layer at 0 when settings.milkyWay.labelEnabled is false', () => {
    // A session with the Milky-Way label toggled off must seed the label layer
    // at 0 so it doesn't flash before produceMilkyWayLabel's first emit.
    const { state, registerSpy } = makeState({ milkyWayLabelEnabled: false });
    registerOverlayFades(state);

    type LabelCall = [Extract<FadeId, { kind: 'labelLayer' }>, number | undefined];
    const labelCalls = calls(registerSpy).filter(
      ([h]) => h.kind === 'labelLayer' && !(h as Extract<FadeId, { kind: 'labelLayer' }>).category,
    ) as LabelCall[];
    const byLayer = Object.fromEntries(labelCalls.map(([h, op]) => [h.layer, op]));

    expect(byLayer['milkyWay']).toBe(0);
  });

  it('galaxyNames registers at opacity 1', () => {
    // Famous-galaxy labels reuse the category-less galaxyNames handle and
    // consume its opacity directly; if it started at 0 they'd never appear.
    const { state, registerSpy } = makeState();
    registerOverlayFades(state);

    const galaxyNamesCall = calls(registerSpy).find(
      ([h]) =>
        h.kind === 'labelLayer' &&
        (h as Extract<FadeId, { kind: 'labelLayer' }>).layer === 'galaxyNames' &&
        !(h as Extract<FadeId, { kind: 'labelLayer' }>).category,
    );
    expect(galaxyNamesCall).toBeDefined();
    expect(galaxyNamesCall![1]).toBe(1);
  });

  // ── per-category marker + structure-label handles ──────────────────────

  it('registers a structure handle per structure source', () => {
    // Each structure source gets its own structure fade controller so its
    // rings can recede/fade independently of the others.
    const { state, registerSpy } = makeState();
    registerOverlayFades(state);

    for (const category of ['cluster', 'supercluster', 'void', 'group'] as const) {
      const markerCall = calls(registerSpy).find(
        ([h]) =>
          h.kind === 'structure' &&
          (h as Extract<FadeId, { kind: 'structure' }>).id === category,
      );
      expect(markerCall, `structure{${category}} should be registered`).toBeDefined();
    }
  });

  it('registers a per-category structure labelLayer handle per structure category', () => {
    // Each structure category gets its own structure labelLayer controller so its
    // labels are addressable independently (Task 2.3 wires the producer).
    const { state, registerSpy } = makeState();
    registerOverlayFades(state);

    for (const category of ['cluster', 'supercluster', 'void', 'group'] as const) {
      const labelCall = calls(registerSpy).find(
        ([h]) =>
          h.kind === 'labelLayer' &&
          (h as Extract<FadeId, { kind: 'labelLayer' }>).layer === 'structure' &&
          (h as Extract<FadeId, { kind: 'labelLayer' }>).category === category,
      );
      expect(labelCall, `labelLayer{structure,${category}} should be registered`).toBeDefined();
    }
  });

  it('disabled categories register at 0, enabled at 1', () => {
    // The persisted per-category visibility is honoured from frame 1: a
    // category the user has turned off registers at opacity 0 so its rings
    // don't flash before a fade fires.
    const { state, registerSpy } = makeState({
      markerCategoryVisibility: { cluster: false },
      labelCategoryVisibility: { supercluster: false },
    });
    registerOverlayFades(state);

    const markerOpacity = (category: string) =>
      calls(registerSpy).find(
        ([h]) =>
          h.kind === 'structure' &&
          (h as Extract<FadeId, { kind: 'structure' }>).id === category,
      )?.[1];
    const labelOpacity = (category: string) =>
      calls(registerSpy).find(
        ([h]) =>
          h.kind === 'labelLayer' &&
          (h as Extract<FadeId, { kind: 'labelLayer' }>).layer === 'structure' &&
          (h as Extract<FadeId, { kind: 'labelLayer' }>).category === category,
      )?.[1];

    expect(markerOpacity('cluster')).toBe(0);
    expect(markerOpacity('void')).toBe(1);
    expect(labelOpacity('supercluster')).toBe(0);
    expect(labelOpacity('cluster')).toBe(1);
  });
});
