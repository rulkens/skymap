/**
 * The one engine stub the fade bridges are driven against: a spied fades registry +
 * scheduler over the REAL composed rows, with settings covering every intent row's
 * leaf and every demand-loaded renderer reporting its asset committed. Stubbing the
 * registry (vs `createFadeRegistry`) avoids pre-registering every handle.
 */

import { vi } from 'vitest';

import { GALAXY_CATALOG_IDS } from '../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { STAR_CATALOG_IDS } from '../../../src/data/starCatalog/starCatalogIds';
import { BODY_IDS } from '../../../src/data/bodies/bodyIds';
import { STRUCTURE_IDS } from '../../../src/data/structure/structureIds';
import { FADE_LAYERS } from '../../../src/services/engine/wiring/fadeLayers';
import { starCatalogFadeRows } from '../../../src/layers/starCatalog/present/starCatalogFadeRows';

import type { FadeId } from '../../../src/@types/animation/FadeId';
import type { EngineSettingsState } from '../../../src/@types/settings/EngineSettingsState';
import type { FadeBridgeState } from './FadeBridgeState';

export function makeFadeBridgeState(): {
  state: FadeBridgeState;
  fadeTo: ReturnType<typeof vi.fn<(id: FadeId, target: number, dur?: number) => Promise<void>>>;
  setImmediate: ReturnType<typeof vi.fn<(id: FadeId, v: number) => void>>;
  targetOf: ReturnType<typeof vi.fn<(id: FadeId) => number | null>>;
  requestRender: ReturnType<typeof vi.fn<() => void>>;
  settings: EngineSettingsState;
} {
  const fadeTo = vi.fn<(id: FadeId, target: number, dur?: number) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const setImmediate = vi.fn<(id: FadeId, v: number) => void>();
  // null never matches a real 0/1 target — every caller keeps seeing its
  // fadeTo/setImmediate calls fire unless a test overrides this.
  const targetOf = vi.fn<(id: FadeId) => number | null>(() => null);
  const requestRender = vi.fn<() => void>();

  const galaxyItems: Record<string, { enabled: boolean; labelEnabled: boolean }> = {};
  for (const id of GALAXY_CATALOG_IDS) galaxyItems[id] = { enabled: true, labelEnabled: false };
  galaxyItems.famousGalaxy = { enabled: true, labelEnabled: true };

  const structureItems: Record<string, { enabled: boolean; labelEnabled: boolean }> = {};
  for (const id of STRUCTURE_IDS) structureItems[id] = { enabled: true, labelEnabled: true };

  const starCatalogItems: Record<string, { enabled: boolean; labelEnabled: boolean }> = {};
  for (const id of STAR_CATALOG_IDS) starCatalogItems[id] = { enabled: true, labelEnabled: true };

  const bodyItems: Record<string, { enabled: boolean; labelEnabled: boolean }> = {};
  for (const id of BODY_IDS) bodyItems[id] = { enabled: true, labelEnabled: true };

  const settings = {
    galaxyCatalogs: { items: galaxyItems },
    starCatalogs: { enabled: true, items: starCatalogItems },
    bodies: { items: bodyItems },
    structures: { enabled: true, items: structureItems },
    milkyWay: { enabled: true, labelEnabled: true },
    zoneOfAvoidance: { enabled: true },
    // Every cube off: the per-cube intent reads false, which is all this fixture needs.
    cosmicWebDensity: {
      enabled: true,
      items: {
        mcpm: { enabled: false },
        'polyphorm-2mrs': { enabled: false },
        'mcpm-workbench': { enabled: false },
      },
    },
    cosmicWebFilaments: { enabled: true },
    flow: { enabled: true },
    orbitTrails: { enabled: true },
    missionTrails: { enabled: false },
  } as unknown as EngineSettingsState;

  const state = {
    settings,
    gpu: {
      galaxyPointRenderer: { hasCatalog: () => true },
    },
    subsystems: {
      fades: { fadeTo, setImmediate, targetOf },
      scheduler: { requestRender },
    },
    // The COMPOSED rows — core's manifest plus every Layer's still on the old path.
    fadeRows: [...FADE_LAYERS, ...starCatalogFadeRows()],
  } as unknown as FadeBridgeState;

  return { state, fadeTo, setImmediate, targetOf, requestRender, settings };
}
