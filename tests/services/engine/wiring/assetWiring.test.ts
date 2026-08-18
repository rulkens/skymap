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
import { Source } from '../../../../src/data/sources';
import { ALL_BODY_TEXTURE_KEYS } from '../../../../src/data/bodies/bodyTextureKeys';
import { loadRadiusMpc } from '../../../../src/services/engine/frame/bodyTextureLoadRadius';
import { distanceMpc } from '../../../../src/utils/math/distanceMpc';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { hostBodyId } from '../../../../src/utils/scene/hostBodyId';
import { bodyTextureSlotKey } from '../../../../src/utils/scene/bodyTextureSlotKey';
import type { AssetKey } from '../../../../src/@types/loading/AssetKey';
import type { DemandCtx } from '../../../../src/@types/loading/DemandCtx';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import type { RequestKey } from '../../../../src/@types/loading/RequestKey';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

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
  cameraPosMpc?: Vec3;
  simDays?: number;
}): DemandCtx {
  return {
    settings: (over.settings ?? {}) as Readonly<EngineSettingsState>,
    request: (k) => over.requests?.has(k) ?? false,
    slotState: (k) => over.slotStates?.[k] ?? 'idle',
    // The body-texture rows read the eye position; a far-away default keeps the
    // surface present without demanding any body texture.
    cameraPosMpc: over.cameraPosMpc ?? [Infinity, Infinity, Infinity],
    // The proximity gate derives host positions at this instant; default to the
    // epoch so `bodyPosOf` below (also J2000) and the gate agree unless a test
    // moves the clock.
    simDays: over.simDays ?? CONST_J2000,
  };
}

/**
 * The world position a body-texture key's proximity gate is measured from at a
 * given sim instant. Host bodies are all orbital (textured planets / Earth /
 * moons) and MOVE, so their position comes from the derived snapshot at
 * `simDays` — the same source the wiring reads.
 */
function bodyPosOf(id: string, simDays: number = CONST_J2000): Readonly<Vec3> {
  return deriveBodyStates(simDays).get(hostBodyId(id as never))!.positionMpc;
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
      'famousGalaxiesMeta',
      'famousStarsMeta',
      'filaments',
      'mcpm',
      'cf4Density',
      'polyphorm',
      'flow',
      'constellations',
      'structureCatalog',
      'pgcAlias',
      'bodyTextureAtlas',
      ...ALL_BODY_TEXTURE_KEYS.map((e) => bodyTextureSlotKey(e.bodyId, e.kind)),
      Source.GaiaStars,
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
    // Point slots are minted directly in wireSlots, not by the registry; rows
    // exist for demand+req only and must carry the skip marker.
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
    expect(rowFor('famousGalaxiesMeta').built).toBeUndefined();
    expect(rowFor('famousStarsMeta').built).toBeUndefined();
  });

  it('mints one externally-built row per body-texture family key', () => {
    // Every (body, kind) entry + the ring is an externally-built row (minted in
    // wireSlots, like the point slots), keyed by its composite
    // slot key, with a tier-clamped BodyTextureReq — not a registry-built sidecar.
    for (const entry of ALL_BODY_TEXTURE_KEYS) {
      const row = rowFor(bodyTextureSlotKey(entry.bodyId, entry.kind));
      expect(row.built).toBe('external');
      // req carries { bodyId, kind, tier } clamped to the (body, kind) ceiling.
      expect(row.req('large')).toMatchObject({ bodyId: entry.bodyId, kind: entry.kind });
    }
  });

  it('external point rows carry a factory that throws if the builder calls it', () => {
    // The throw is the runtime enforcement of the build-skip contract: the
    // slot builder must skip `built: 'external'` rows. If it ever calls the
    // factory anyway, this surfaces the wiring bug loudly rather than minting
    // a duplicate point slot.
    const sdss = rowFor(Source.SDSS);
    expect(() => sdss.factory({} as never)).toThrow(/externally-built rows/);
  });
});

describe('ASSET_WIRING demand predicates', () => {
  it("galaxy catalog rows demand the galaxy catalog's enabled settings bit", () => {
    const sdss = rowFor(Source.SDSS);
    expect(
      sdss.demand(
        makeCtx({ settings: { galaxyCatalogs: { items: { sdss: { enabled: true } } } } }),
      ),
    ).toBe(true);
    // Absent items row (or disabled bit) ⇒ not demanded.
    expect(sdss.demand(makeCtx({ settings: { galaxyCatalogs: { items: {} } } }))).toBe(false);
  });

  it('famousGalaxiesMeta demands when the Famous slot is not idle', () => {
    const famousGalaxiesMeta = rowFor('famousGalaxiesMeta');
    expect(
      famousGalaxiesMeta.demand(makeCtx({ slotStates: { [Source.FamousGalaxy]: 'loading' } })),
    ).toBe(true);
    expect(
      famousGalaxiesMeta.demand(makeCtx({ slotStates: { [Source.FamousGalaxy]: 'idle' } })),
    ).toBe(false);
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

  it('polyphorm demand follows its field-enabled flag', () => {
    const polyphorm = rowFor('polyphorm');
    expect(
      polyphorm.demand(
        makeCtx({ settings: { volumes: { items: { 'polyphorm-2mrs': { enabled: true } } } } }),
      ),
    ).toBe(true);
    // Default-off (field absent) ⇒ false.
    expect(polyphorm.demand(makeCtx({ settings: { volumes: { items: {} } } }))).toBe(false);
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

  it('gaiaStars demand follows settings.starCatalogs (master gate AND per-item bit)', () => {
    // The star-catalog cluster mirrors the galaxy-catalog cluster: a coarse
    // master gate (`starCatalogs.enabled`) AND a per-catalog `items[id].enabled`
    // bit must BOTH be true for the layer to load — the source-type-cluster
    // convention. Exercised as a predicate over ctx variations, not a
    // restatement of the row literal.
    const gaia = rowFor(Source.GaiaStars);
    const on = (starCatalogs: unknown) => gaia.demand(makeCtx({ settings: { starCatalogs } }));
    // Master on + item on ⇒ demanded.
    expect(on({ enabled: true, items: { gaiaStars: { enabled: true } } })).toBe(true);
    // Master off overrides an enabled item ⇒ not demanded.
    expect(on({ enabled: false, items: { gaiaStars: { enabled: true } } })).toBe(false);
    // Item off under an on master ⇒ not demanded.
    expect(on({ enabled: true, items: { gaiaStars: { enabled: false } } })).toBe(false);
    // Absent item row (nothing seeded) ⇒ not demanded.
    expect(on({ enabled: true, items: {} })).toBe(false);
  });

  it('body-texture rows encode load/evict hysteresis via demand vs release', () => {
    // Hand-place the camera along +x from a known body's position at three
    // distances relative to its load radius. `demand` fires inside X, `release`
    // fires outside 2X, and the band between is the hysteresis gap where NEITHER
    // fires — a gap `!demand` could not encode, so a camera dithering at the
    // boundary never thrashes the multi-MB texture load/free cycle.
    const earth = rowFor('earth:surface');
    const pos = bodyPosOf('earth');
    const r = loadRadiusMpc('earth');
    const at = (d: number): Vec3 => [pos[0] + d, pos[1], pos[2]];

    // (a) inside the load radius: demand true, release false.
    const inside = makeCtx({ cameraPosMpc: at(0.5 * r) });
    expect(earth.demand(inside)).toBe(true);
    expect(earth.release!(inside)).toBe(false);

    // (b) in the hysteresis band (between X and 2X): BOTH false.
    const band = makeCtx({ cameraPosMpc: at(1.5 * r) });
    expect(earth.demand(band)).toBe(false);
    expect(earth.release!(band)).toBe(false);

    // (c) beyond 2X: demand false, release true.
    const beyond = makeCtx({ cameraPosMpc: at(2.5 * r) });
    expect(earth.demand(beyond)).toBe(false);
    expect(earth.release!(beyond)).toBe(true);
  });

  it('body-texture proximity gate reflects the LIVE snapshot position, not J2000', () => {
    // A host body moves with the clock, so the gate must measure against where
    // the body sits at `ctx.simDays`, not the epoch. Pick an instant far enough
    // from J2000 that Earth has swung a good fraction of its orbit, so its
    // position differs by more than a load radius. Place the camera exactly at
    // the LIVE Earth position: the gate must demand there and NOT at the (now
    // distant) J2000 position — a gate still reading J2000 would fail both arms.
    const earth = rowFor('earth:surface');
    const simDays = CONST_J2000 + 120; // ~1/3 of an Earth year on
    const livePos = bodyPosOf('earth', simDays);
    const j2000Pos = bodyPosOf('earth', CONST_J2000);
    const r = loadRadiusMpc('earth');

    // Sanity: the two epochs are more than a load radius apart, else the test
    // proves nothing.
    expect(distanceMpc(livePos, j2000Pos)).toBeGreaterThan(r);

    // Camera at the live position, clock at the live instant ⇒ demanded.
    expect(earth.demand(makeCtx({ cameraPosMpc: [...livePos] as Vec3, simDays }))).toBe(true);
    // Same camera, but the gate reading J2000 would place the body a full orbit
    // arc away ⇒ NOT demanded. Passing the live simDays is what makes it fire.
    expect(earth.demand(makeCtx({ cameraPosMpc: [...j2000Pos] as Vec3, simDays }))).toBe(false);
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
    expect(rowFor('famousGalaxiesMeta').req('small')).toEqual({ tier: 'small' });
    expect(rowFor('famousStarsMeta').req('small')).toEqual({ tier: 'small' });
    expect(rowFor('filaments').req('medium')).toEqual({ tier: 'medium' });
    expect(rowFor('mcpm').req('large')).toEqual({ tier: 'large' });
    expect(rowFor('polyphorm').req('large')).toEqual({ tier: 'large' });
  });

  it('structureCatalog req is the empty request', () => {
    expect(rowFor('structureCatalog').req('medium')).toEqual({});
  });

  it('void-request sidecars (cf4Density, pgcAlias) return undefined', () => {
    expect(rowFor('cf4Density').req('medium')).toBeUndefined();
    expect(rowFor('pgcAlias').req('medium')).toBeUndefined();
  });
});
