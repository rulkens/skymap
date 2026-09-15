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
import { expandCompanionRows } from '../../../../src/utils/loading/expandCompanionRows';
import { sameRequest } from '../../../../src/utils/loading/sameRequest';
import { Source } from '../../../../src/data/sources';
import { ALL_BODY_TEXTURE_KEYS } from '../../../../src/data/bodies/bodyTextureKeys';
import { loadRadiusMpc } from '../../../../src/services/engine/frame/bodyTextureLoadRadius';
import { distanceMpc } from '../../../../src/utils/math/distanceMpc';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { hostBodyId } from '../../../../src/utils/scene/hostBodyId';
import { bodyTextureSlotKey } from '../../../../src/utils/scene/bodyTextureSlotKey';
import { meshBodySlotKey } from '../../../../src/utils/scene/meshBodySlotKey';
import type { AssetKey } from '../../../../src/@types/loading/AssetKey';
import type { DemandCtx } from '../../../../src/@types/loading/DemandCtx';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import type { RequestKey } from '../../../../src/@types/loading/RequestKey';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// Core's half of the rows as the demand loop sees them; each Layer's own are
// folded in beside these by `createLayers`, and tested beside their Layer.
const EXPANDED_ROWS = expandCompanionRows(ASSET_WIRING);

/** Find the single row for an asset key (throws if absent — keeps tests crisp). */
function rowFor(key: AssetKey) {
  const r = EXPANDED_ROWS.find((row) => row.key === key);
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
});

describe('ASSET_WIRING demand predicates', () => {
  it('filaments demand follows settings.filaments.enabled (bug-fix pin)', () => {
    const filaments = rowFor('filaments');
    expect(filaments.demand(makeCtx({ settings: { filaments: { enabled: true } } }))).toBe(true);
    expect(filaments.demand(makeCtx({ settings: { filaments: { enabled: false } } }))).toBe(false);
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
});

describe('ASSET_WIRING req builders', () => {
  it('the filaments request drifts only across the small boundary', () => {
    const row = rowFor('filaments');
    // Polarity, not just drift: a flipped flag would fetch the wrong file at
    // every tier while keeping the drift assertions below green.
    expect(row.req('small')).toEqual({ small: true });
    expect(row.req('large')).toEqual({ small: false });
    expect(sameRequest(row.req('medium'), row.req('large'))).toBe(true);
    expect(sameRequest(row.req('small'), row.req('medium'))).toBe(false);
  });

  it("the famous-stars-meta row's request is undefined at every tier", () => {
    const row = rowFor('famousStarsMeta');
    for (const tier of ['small', 'medium', 'large'] as const) {
      expect(row.req(tier)).toBeUndefined();
    }
  });
});
