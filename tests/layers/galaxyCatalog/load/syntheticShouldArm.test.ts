/**
 * syntheticShouldArm — the whole backstop policy. Each case names the bug it
 * catches, because every one of them is invisible to the type system: the
 * predicate reads a `LoadState` union whose every limb type-checks.
 */

import { describe, it, expect } from 'vitest';

import { syntheticShouldArm } from '../../../../src/layers/galaxyCatalog/load/syntheticShouldArm';
import { FormatVersionError } from '../../../../src/data/formatVersionError';
import { Source, GALAXY_CATALOG_SOURCES, SOURCE_REGISTRY } from '../../../../src/data/sources';
import { galaxyCatalogIdOf } from '../../../../src/utils/galaxyCatalogIdOf';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogReq } from '../../../../src/@types/loading/GalaxyCatalogReq';
import type { GalaxyCatalogRuntime } from '../../../../src/layers/galaxyCatalog/types/GalaxyCatalogRuntime';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { SourceType } from '../../../../src/@types/data/SourceType';

const SURVEY_SOURCES: readonly SourceType[] = GALAXY_CATALOG_SOURCES.filter(
  (code) => SOURCE_REGISTRY[code].category === 'survey',
);

type Slot = AssetSlot<GalaxyCatalog, GalaxyCatalogReq>;

// Only `kind`, `value.count` and `error` are read, so the fixtures carry just
// those — the slot is the one the predicate sees, not a real `createAssetSlot`.
function slotIn(state: Partial<LoadState<GalaxyCatalog>>): Slot {
  return { state: () => state } as unknown as Slot;
}

const IDLE = slotIn({ kind: 'idle' });
const LOADING = slotIn({ kind: 'loading' });
const ERRORED = slotIn({ kind: 'error', error: new Error('404') });
const VERSION_MISMATCH = slotIn({
  kind: 'error',
  error: new FormatVersionError('galaxy', 8, 9, 'unsupported version'),
});

function readyWith(count: number): Slot {
  return slotIn({ kind: 'ready', value: { count } as GalaxyCatalog });
}

/** Every galaxy source errored, then the per-case overrides. */
function runtimeWith(over: Partial<Record<SourceType, Slot>>): GalaxyCatalogRuntime {
  const points = new Map<SourceType, Slot>();
  for (const code of GALAXY_CATALOG_SOURCES) points.set(code, ERRORED);
  for (const [code, slot] of Object.entries(over)) points.set(Number(code) as SourceType, slot!);
  return { points } as unknown as GalaxyCatalogRuntime;
}

/** Every galaxy catalog enabled, then the per-case overrides. */
function settingsWith(disabled: readonly SourceType[]): Readonly<EngineSettingsState> {
  const items: Record<string, { enabled: boolean }> = {};
  for (const code of GALAXY_CATALOG_SOURCES) {
    items[galaxyCatalogIdOf(code)] = { enabled: !disabled.includes(code) };
  }
  return { galaxyCatalogs: { items } } as unknown as Readonly<EngineSettingsState>;
}

const ALL_ENABLED = settingsWith([]);

describe('syntheticShouldArm', () => {
  it('does not arm while an enabled survey catalog is still in flight', () => {
    // Bug: arming mid-boot loads the synthetic cloud on top of a real catalog
    // that lands a frame later — two clouds in the sky, neither evictable.
    expect(syntheticShouldArm(runtimeWith({ [Source.SDSS]: LOADING }), ALL_ENABLED)).toBe(false);
    expect(syntheticShouldArm(runtimeWith({ [Source.SDSS]: IDLE }), ALL_ENABLED)).toBe(false);
  });

  it('treats `ready` with count 0 as no data, and count > 0 as data', () => {
    // Bug: keying on the `LoadStateKind` discriminant alone — an empty-but-ready
    // catalog then suppresses the backstop and the user gets an empty sky. This
    // is the exact reason the policy cannot live in `DemandCtx.slotState`.
    expect(syntheticShouldArm(runtimeWith({ [Source.SDSS]: readyWith(0) }), ALL_ENABLED)).toBe(
      true,
    );
    expect(syntheticShouldArm(runtimeWith({ [Source.SDSS]: readyWith(12) }), ALL_ENABLED)).toBe(
      false,
    );
  });

  it('arms when every survey catalog has errored', () => {
    // Bug: the backstop never fires on a total data outage — the "show
    // *something*" guarantee is the module's whole reason to exist.
    expect(syntheticShouldArm(runtimeWith({}), ALL_ENABLED)).toBe(true);
  });

  it('counts a disabled catalog as settled rather than waiting on it forever', () => {
    // Bug: a catalog the user turned off never transitions out of `idle`, so
    // treating it as pending deadlocks the backstop — with every other catalog
    // errored the sky stays empty for the whole session.
    const runtime = runtimeWith({ [Source.SDSS]: IDLE, [Source.TwoMRS]: IDLE });
    expect(syntheticShouldArm(runtime, ALL_ENABLED)).toBe(false);
    expect(syntheticShouldArm(runtime, settingsWith([Source.SDSS, Source.TwoMRS]))).toBe(true);
  });

  it('arms when every survey catalog is disabled', () => {
    const allIdle = Object.fromEntries(SURVEY_SOURCES.map((code) => [code, IDLE]));
    expect(syntheticShouldArm(runtimeWith(allIdle), settingsWith(SURVEY_SOURCES))).toBe(true);
  });

  it('never arms over a FormatVersionError, from a survey OR the curated Famous catalog', () => {
    // Bug: the backstop papers over the version alert `installFormatVersionAlert`
    // is raising — the user sees a synthetic cloud instead of "regenerate the
    // .bin". Famous is the limb that regressed: the deleted gate latched the
    // mismatch from every tier-fetched source, not just the survey ones.
    expect(syntheticShouldArm(runtimeWith({ [Source.SDSS]: VERSION_MISMATCH }), ALL_ENABLED)).toBe(
      false,
    );
    expect(
      syntheticShouldArm(runtimeWith({ [Source.FamousGalaxy]: VERSION_MISMATCH }), ALL_ENABLED),
    ).toBe(false);
  });

  it('ignores the curated Famous catalog otherwise — it neither suppresses nor triggers', () => {
    // Bug: a Famous-only success suppresses the backstop (empty sky behind a
    // handful of thumbnails), or a Famous-only failure triggers it over real data.
    const famousReady = { [Source.FamousGalaxy]: readyWith(40) };
    expect(syntheticShouldArm(runtimeWith(famousReady), ALL_ENABLED)).toBe(true);
    expect(
      syntheticShouldArm(runtimeWith({ ...famousReady, [Source.SDSS]: readyWith(9) }), ALL_ENABLED),
    ).toBe(false);
  });
});
