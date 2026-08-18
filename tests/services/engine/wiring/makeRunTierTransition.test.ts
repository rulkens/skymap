/**
 * makeRunTierTransition — dispatch-free tier-transition effect unit tests.
 *
 * These drive the factory's returned `(prev, next) => void` against a minimal
 * fake `EngineState` + `bootstrapDeps`, asserting the per-source reload
 * orchestration WITHOUT standing up a GPU engine. The state's `settings` are
 * backed by a real `createAppStore` + getter (mirroring the engine's
 * delegation), so the enabled-intent short-circuit reads the same shape the
 * engine does.
 *
 * `rebuildHiResFamousForTier` is mocked to a typed spy so the device + renderer
 * gate can be asserted without a real texture rebuild.
 *
 * Tier pair: `prev='small'`, `next='medium'`. From the real registry caps —
 *   SDSS:  small→0,       medium→156_000  → target CHANGED  → reloads
 *   Glade: small→256_000, medium→400_000  → target CHANGED  → reloads
 *   2MRS:  (no caps) → undefined both → UNCHANGED → skipped
 * which gives one source whose target changed and one whose didn't, picked from
 * real data rather than hand-tuned fixtures.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Source, GALAXY_CATALOG_SOURCES, SOURCE_REGISTRY } from '../../../../src/data/sources';
import type { GalaxyCatalogId } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalogId';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../../src/@types/engine/BootstrapDeps';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';
import { createAppStore } from '../../../../src/store/createAppStore';
import { makeRunTierTransition } from '../../../../src/services/engine/wiring/makeRunTierTransition';
import { rebuildHiResFamousForTier } from '../../../../src/services/engine/helpers/rebuildHiResFamousForTier';

// The famous-texture rebuild is the seam under test for the device/renderer
// gate: mock it to a typed spy so the runner's gating contract is asserted
// without a real GPU rebuild.
vi.mock('../../../../src/services/engine/helpers/rebuildHiResFamousForTier', () => ({
  rebuildHiResFamousForTier:
    vi.fn<
      typeof import('../../../../src/services/engine/helpers/rebuildHiResFamousForTier').rebuildHiResFamousForTier
    >(),
}));

const rebuild = vi.mocked(rebuildHiResFamousForTier);

type SlotStub = { load: ReturnType<typeof vi.fn> };

// ── Fixture factory ────────────────────────────────────────────────────────
//
// A minimal state whose `settings` come from a real store (so the enabled
// short-circuit reads the authoritative shape), plus stub asset slots that
// record their `.load` calls. `enabledOverrides` lets a test disable a source.
function makeFixture(opts?: {
  enabledOverrides?: Partial<Record<GalaxyCatalogId, boolean>>;
  device?: GPUDevice | undefined;
  texturedDiskRenderer?: unknown;
  gaiaStarsState?: 'idle' | 'ready';
}) {
  const items = Object.fromEntries(
    GALAXY_CATALOG_SOURCES.map((s) => {
      const id = SOURCE_REGISTRY[s].id as GalaxyCatalogId;
      const enabled = opts?.enabledOverrides?.[id] ?? true;
      return [id, { enabled, labelEnabled: true }];
    }),
  );
  const { store } = createAppStore({
    settings: { galaxyCatalogs: { items } } as unknown as EngineSettingsState,
  });

  // One slot stub per galaxy-catalog source so `.points.get(src)?.load(...)`
  // always resolves to a recording spy.
  const pointSlots = new Map<number, SlotStub>();
  for (const s of GALAXY_CATALOG_SOURCES) pointSlots.set(s, { load: vi.fn() });
  const mcpm: SlotStub = { load: vi.fn() };
  const polyphorm: SlotStub = { load: vi.fn() };
  // Star-catalog slot stub carries `state()` because the runner's idle-guard
  // reads it (a never-demanded catalog must not fetch on a tier flip).
  const gaiaStars = {
    load: vi.fn(),
    state: vi.fn(() => ({ kind: opts?.gaiaStarsState ?? 'ready' })),
  };
  const starCatalogs = new Map<number, typeof gaiaStars>([[Source.GaiaStars, gaiaStars]]);

  const state = {
    get settings() {
      return store.getState().settings;
    },
    assetSlots: {
      points: pointSlots,
      starCatalogs,
      mcpm,
      polyphorm,
      // famous companion sidecar — loadCompanionAssets fires `.load` on it.
      famousGalaxiesMeta: { load: vi.fn() } as SlotStub,
    },
    gpu: {
      texturedDiskRenderer: opts?.texturedDiskRenderer ?? null,
      // No milkyWayCloud stub: this runner no longer calls `.regenerate`
      // itself (see makeRunTierTransition.ts's comment) — the Milky-Way
      // star count reaches the tier swap via `watchTierSaga`'s re-seed +
      // `runFrame`'s mismatch check, neither of which this runner touches.
      milkyWayCloud: null,
    },
    subsystems: {
      scheduler: { requestRender: vi.fn() },
    },
  } as unknown as EngineState;

  const bootstrapDeps = {
    phaseLocals: opts?.device ? { device: opts.device } : undefined,
  } as unknown as BootstrapDeps;

  return { state, store, pointSlots, mcpm, polyphorm, gaiaStars, bootstrapDeps };
}

describe('makeRunTierTransition', () => {
  beforeEach(() => rebuild.mockClear());

  it('loads each enabled source whose tierTarget changed', () => {
    const fx = makeFixture();
    const run = makeRunTierTransition(fx.state, fx.bootstrapDeps);
    run('small', 'medium');

    // SDSS (0 → 156k) and Glade (256k → 400k) both change between small/medium.
    expect(fx.pointSlots.get(Source.SDSS)!.load).toHaveBeenCalledTimes(1);
    expect(fx.pointSlots.get(Source.SDSS)!.load).toHaveBeenCalledWith({
      source: Source.SDSS,
      tier: 'medium',
      dissolvePrevious: true,
    });
    expect(fx.pointSlots.get(Source.Glade)!.load).toHaveBeenCalledTimes(1);
    expect(fx.pointSlots.get(Source.Glade)!.load).toHaveBeenCalledWith({
      source: Source.Glade,
      tier: 'medium',
      dissolvePrevious: true,
    });
  });

  it('skips a source whose tierTarget is unchanged', () => {
    const fx = makeFixture();
    const run = makeRunTierTransition(fx.state, fx.bootstrapDeps);
    run('small', 'medium');

    // 2MRS carries no tier caps → undefined target on both tiers → unchanged.
    expect(fx.pointSlots.get(Source.TwoMRS)!.load).not.toHaveBeenCalled();
  });

  it('skips a disabled source even if its target changed', () => {
    const fx = makeFixture({ enabledOverrides: { sdss: false } });
    const run = makeRunTierTransition(fx.state, fx.bootstrapDeps);
    run('small', 'medium');

    // SDSS target changed but it's disabled → no reload; Glade still reloads.
    expect(fx.pointSlots.get(Source.SDSS)!.load).not.toHaveBeenCalled();
    expect(fx.pointSlots.get(Source.Glade)!.load).toHaveBeenCalledTimes(1);
  });

  it('reloads MCPM at the next tier', () => {
    const fx = makeFixture();
    const run = makeRunTierTransition(fx.state, fx.bootstrapDeps);
    run('small', 'medium');

    expect(fx.mcpm.load).toHaveBeenCalledTimes(1);
    expect(fx.mcpm.load).toHaveBeenCalledWith({ tier: 'medium' });
  });

  it('reloads Polyphorm at the next tier', () => {
    const fx = makeFixture();
    const run = makeRunTierTransition(fx.state, fx.bootstrapDeps);
    run('small', 'medium');

    expect(fx.polyphorm.load).toHaveBeenCalledTimes(1);
    expect(fx.polyphorm.load).toHaveBeenCalledWith({ tier: 'medium' });
  });

  it('reloads a loaded star catalog at the next tier (per-source request)', () => {
    // The star catalogs are tier-aware like MCPM but per-source: without this
    // reload, a tier flip would leave the Gaia layer drawing the OLD tier's
    // star population while every other tiered layer swapped.
    const fx = makeFixture();
    const run = makeRunTierTransition(fx.state, fx.bootstrapDeps);
    run('small', 'medium');

    expect(fx.gaiaStars.load).toHaveBeenCalledTimes(1);
    expect(fx.gaiaStars.load).toHaveBeenCalledWith({ source: Source.GaiaStars, tier: 'medium' });
  });

  it('skips an idle (never-demanded) star catalog — disabled ⇒ no work', () => {
    // An idle slot means the catalog was never demanded (layer disabled): a
    // tier flip must not start fetching data for a hidden layer. When the
    // user later enables it, reevaluateDemand issues the current tier's
    // request against the still-idle slot.
    const fx = makeFixture({ gaiaStarsState: 'idle' });
    const run = makeRunTierTransition(fx.state, fx.bootstrapDeps);
    run('small', 'medium');

    expect(fx.gaiaStars.load).not.toHaveBeenCalled();
  });

  it('skips the hi-res famous rebuild when device is undefined', () => {
    const fx = makeFixture({ texturedDiskRenderer: { bindHiResArray: vi.fn() } });
    const run = makeRunTierTransition(fx.state, fx.bootstrapDeps);
    run('small', 'medium');

    expect(rebuild).not.toHaveBeenCalled();
  });

  it('runs the hi-res famous rebuild when device + renderer are both present', () => {
    const device = {} as unknown as GPUDevice;
    const texturedDiskRenderer = { bindHiResArray: vi.fn() };
    const fx = makeFixture({ device, texturedDiskRenderer });
    const run = makeRunTierTransition(fx.state, fx.bootstrapDeps);
    run('small', 'medium');

    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(rebuild).toHaveBeenCalledWith(expect.objectContaining({ tier: 'medium' }));
  });
});
