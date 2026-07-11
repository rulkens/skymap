/**
 * ASSET_WIRING — unit tests for the asset-wiring registry's demand table.
 *
 * The registry is pure data: one row per fetchable asset, each carrying a
 * `demand(ctx)` predicate and a `req(tier)` request builder. These tests pin
 * the membership set and exercise every row's demand predicate against a stub
 * `DemandCtx`, so the load policy for each asset is verified in isolation
 * without a full engine.
 *
 * Two of the predicates are bug-fix pins (see the module docstring on
 * `assetWiring.ts`): `filaments` follows `settings.filaments.enabled`, and
 * `structureCatalog` follows structure-category visibility — it loads when any
 * category has its ring (`structures.items[cat].enabled`) OR its label
 * (`.labelEnabled`) on.
 */

import { describe, it, expect } from 'vitest';
import { ASSET_WIRING } from '../../../../src/services/engine/wiring/assetWiring';
import { EARTH_TEXTURE_MAX_DISTANCE_MPC } from '../../../../src/services/loading/slots/earthTextureSlot';
import { Source } from '../../../../src/data/sources';
import type { AssetKey } from '../../../../src/@types/loading/AssetKey';
import type { DemandCtx } from '../../../../src/@types/loading/DemandCtx';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import type { RequestKey } from '../../../../src/@types/loading/RequestKey';

/** Find the single row for an asset key (throws if absent — keeps tests crisp). */
function rowFor(key: AssetKey) {
  const r = ASSET_WIRING.find((row) => row.key === key);
  if (!r) throw new Error(`no ASSET_WIRING row for key ${String(key)}`);
  return r;
}

/**
 * Build a stub DemandCtx. Every surface defaults to "off / idle"; overrides
 * patch only the slice a given test cares about. `settings` is cast through
 * `unknown` — predicates touch only the leaves they read, so a partial shape
 * is sufficient and avoids constructing the full ~12-field settings bag.
 */
function makeCtx(over: {
  settings?: unknown;
  requests?: Set<RequestKey>;
  slotStates?: Partial<Record<AssetKey, LoadState<unknown>['kind']>>;
  cameraDistanceMpc?: number;
}): DemandCtx {
  return {
    settings: (over.settings ?? {}) as Readonly<EngineSettingsState>,
    request: (k) => over.requests?.has(k) ?? false,
    slotState: (k) => over.slotStates?.[k] ?? 'idle',
    // Default far away (never within the descent gate) so unrelated demand
    // tests aren't accidentally in the Earth-texture proximity window.
    cameraDistanceMpc: over.cameraDistanceMpc ?? Infinity,
  };
}

describe('ASSET_WIRING membership', () => {
  it('has exactly one row per fetchable asset key', () => {
    const keys = ASSET_WIRING.map((r) => r.key);
    const expected: AssetKey[] = [
      Source.SDSS,
      Source.TwoMRS,
      Source.Glade,
      Source.Milliquas,
      Source.FamousGalaxy,
      Source.DesiDeep,
      Source.DesiWedge,
      Source.DesiSgw,
      Source.Synthetic,
      'famousMeta',
      'filaments',
      'mcpm',
      'cf4Density',
      'flow',
      'structureCatalog',
      'pgcAlias',
      'earthTexture',
    ];
    expect(new Set(keys)).toEqual(new Set(expected));
    // No duplicate rows.
    expect(keys.length).toBe(expected.length);
  });

  it('does NOT include the non-fetched structure sources (Cluster/Supercluster/Void)', () => {
    const keys = new Set<AssetKey>(ASSET_WIRING.map((r) => r.key));
    expect(keys.has(Source.Cluster)).toBe(false);
    expect(keys.has(Source.Supercluster)).toBe(false);
    expect(keys.has(Source.Void)).toBe(false);
  });

  it('marks the point-source rows as externally built', () => {
    // Point slots are minted in initGpu, not by the registry; rows exist for
    // demand+req only and must carry the skip marker.
    const pointKeys: SourceType[] = [
      Source.SDSS,
      Source.TwoMRS,
      Source.Glade,
      Source.Milliquas,
      Source.FamousGalaxy,
      Source.DesiDeep,
      Source.DesiWedge,
      Source.DesiSgw,
      Source.Synthetic,
    ];
    for (const k of pointKeys) {
      expect(rowFor(k).built).toBe('external');
    }
    // The sidecar rows are registry-built (no marker).
    expect(rowFor('filaments').built).toBeUndefined();
    expect(rowFor('famousMeta').built).toBeUndefined();
  });

  it('includes a registry-built earthTexture row', () => {
    // The Earth texture is a first-class registry-built sidecar (not
    // `built: 'external'` like the point slots), with a void request — one
    // tier-agnostic texture, neither tiered nor per-source.
    const earth = rowFor('earthTexture');
    expect(earth.built).toBeUndefined();
    expect(earth.req('medium')).toBeUndefined();
  });

  it('external point rows carry a factory that throws if the builder calls it', () => {
    // The throw is the runtime enforcement of the build-skip contract: the
    // slot builder must skip `built: 'external'` rows. If it ever calls the
    // factory anyway, this surfaces the wiring bug loudly rather than minting
    // a duplicate point slot.
    const sdss = rowFor(Source.SDSS);
    expect(() => sdss.factory({} as never)).toThrow(/initGpu/);
  });
});

describe('ASSET_WIRING demand predicates', () => {
  it("galaxy catalog rows demand the galaxy catalog's enabled settings bit", () => {
    const sdss = rowFor(Source.SDSS);
    expect(
      sdss.demand(makeCtx({ settings: { galaxyCatalogs: { items: { sdss: { enabled: true } } } } })),
    ).toBe(true);
    // Absent items row (or disabled bit) ⇒ not demanded.
    expect(sdss.demand(makeCtx({ settings: { galaxyCatalogs: { items: {} } } }))).toBe(false);
  });

  it('famousMeta demands when the Famous slot is not idle', () => {
    const famousMeta = rowFor('famousMeta');
    expect(famousMeta.demand(makeCtx({ slotStates: { [Source.FamousGalaxy]: 'loading' } }))).toBe(
      true,
    );
    expect(famousMeta.demand(makeCtx({ slotStates: { [Source.FamousGalaxy]: 'idle' } }))).toBe(
      false,
    );
  });

  it('filaments demand follows settings.filaments.enabled (bug-fix pin)', () => {
    const filaments = rowFor('filaments');
    expect(filaments.demand(makeCtx({ settings: { filaments: { enabled: true } } }))).toBe(true);
    expect(filaments.demand(makeCtx({ settings: { filaments: { enabled: false } } }))).toBe(false);
  });

  it('mcpm demand follows its field-enabled flag', () => {
    const mcpm = rowFor('mcpm');
    expect(
      mcpm.demand(makeCtx({ settings: { volumes: { items: { mcpm: { enabled: true } } } } })),
    ).toBe(true);
    // Default-off (field absent) ⇒ false.
    expect(mcpm.demand(makeCtx({ settings: { volumes: { items: {} } } }))).toBe(false);
  });

  it('cf4Density demand follows its field-enabled flag (default-off ⇒ false)', () => {
    const cf4 = rowFor('cf4Density');
    expect(
      cf4.demand(
        makeCtx({ settings: { volumes: { items: { 'cf4-density': { enabled: true } } } } }),
      ),
    ).toBe(true);
    expect(cf4.demand(makeCtx({ settings: { volumes: { items: {} } } }))).toBe(false);
  });

  it('flow demand follows settings.flow.enabled (singleton overlay layer)', () => {
    // Flow's master gate lives in settings alongside filaments/milkyWay — no
    // bespoke DemandCtx surface. See singleton-overlay-layers convention.
    const flow = rowFor('flow');
    expect(flow.demand(makeCtx({ settings: { flow: { enabled: true } } }))).toBe(true);
    expect(flow.demand(makeCtx({ settings: { flow: { enabled: false } } }))).toBe(false);
  });

  it('structureCatalog demand follows structure-category visibility (bug-fix pin)', () => {
    const cluster = rowFor('structureCatalog');
    // Every category's ring + label off — both axes read from the item rows.
    const allHidden = {
      structures: {
        enabled: true,
        items: {
          cluster: { enabled: false, labelEnabled: false },
          supercluster: { enabled: false, labelEnabled: false },
          void: { enabled: false, labelEnabled: false },
          group: { enabled: false, labelEnabled: false },
        },
      },
    };
    expect(cluster.demand(makeCtx({ settings: allHidden }))).toBe(false);

    // Any single structure category visible in EITHER its ring or its label ⇒ true.
    expect(
      cluster.demand(
        makeCtx({
          settings: {
            structures: {
              enabled: true,
              items: {
                ...allHidden.structures.items,
                cluster: { enabled: true, labelEnabled: false },
              },
            },
          },
        }),
      ),
    ).toBe(true);
    expect(
      cluster.demand(
        makeCtx({
          settings: {
            structures: {
              enabled: true,
              items: {
                ...allHidden.structures.items,
                void: { enabled: false, labelEnabled: true },
              },
            },
          },
        }),
      ),
    ).toBe(true);
  });

  it('the earthTexture row demands the texture only within the descent threshold', () => {
    // Descent-gated: demanded once the camera drops below the threshold, not
    // at boot (far away / no camera field ⇒ false).
    const earth = rowFor('earthTexture');
    expect(earth.demand(makeCtx({ cameraDistanceMpc: EARTH_TEXTURE_MAX_DISTANCE_MPC / 2 }))).toBe(
      true,
    );
    expect(earth.demand(makeCtx({ cameraDistanceMpc: EARTH_TEXTURE_MAX_DISTANCE_MPC * 10 }))).toBe(
      false,
    );
    expect(earth.demand(makeCtx({}))).toBe(false);
  });

  it('pgcAlias demands only when the paletteOpened request is set', () => {
    const pgc = rowFor('pgcAlias');
    expect(pgc.demand(makeCtx({ requests: new Set(['paletteOpened']) }))).toBe(true);
    expect(pgc.demand(makeCtx({ requests: new Set() }))).toBe(false);
  });

  it("Synthetic demands only when the 'syntheticFallback' request is armed", () => {
    // The precise gate (count-aware, hidden-at-boot-aware) lives in
    // createSyntheticFallback, which trips this request flag. The row's
    // predicate is now a plain flag read; slot states are irrelevant to it.
    const synth = rowFor(Source.Synthetic);
    expect(synth.demand(makeCtx({ requests: new Set(['syntheticFallback']) }))).toBe(true);
    expect(synth.demand(makeCtx({ requests: new Set() }))).toBe(false);
    // Galaxy catalog slot states don't move the predicate any more.
    expect(
      synth.demand(
        makeCtx({
          slotStates: {
            [Source.SDSS]: 'error',
            [Source.TwoMRS]: 'error',
            [Source.Glade]: 'error',
            [Source.Milliquas]: 'error',
          },
        }),
      ),
    ).toBe(false);
  });
});

describe('ASSET_WIRING req builders', () => {
  it('galaxy catalog rows carry { source, tier }', () => {
    expect(rowFor(Source.SDSS).req('medium')).toEqual({ source: Source.SDSS, tier: 'medium' });
    expect(rowFor(Source.Synthetic).req('large')).toEqual({
      source: Source.Synthetic,
      tier: 'large',
    });
  });

  it('tier-aware sidecars carry { tier }', () => {
    expect(rowFor('famousMeta').req('small')).toEqual({ tier: 'small' });
    expect(rowFor('filaments').req('medium')).toEqual({ tier: 'medium' });
    expect(rowFor('mcpm').req('large')).toEqual({ tier: 'large' });
  });

  it('structureCatalog req is the empty request', () => {
    expect(rowFor('structureCatalog').req('medium')).toEqual({});
  });

  it('void-request sidecars (cf4Density, pgcAlias) return undefined', () => {
    expect(rowFor('cf4Density').req('medium')).toBeUndefined();
    expect(rowFor('pgcAlias').req('medium')).toBeUndefined();
  });
});
