/**
 * visibilityActionRow — a DATA TABLE mapping every VisibilityLayerKey to the
 * factory computing the settings action(s) that turn it on/off.
 *
 * The factory is `(on, settings) => Action[]`, not `(on) => SettingsAction`, because
 * a per-item layer must enumerate live item ids out of settings and emit one action
 * each; gate-backed layers ignore `settings` and return one element. Registration-
 * only layers return `[]`, keeping the table TOTAL so no caller has to branch.
 */

import type { Action } from '@reduxjs/toolkit';
import type { VisibilityLayerKey } from '../../@types/animation/VisibilityLayerKey';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';
import type { GalaxyCatalogId } from '../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { StarCatalogId } from '../../@types/data/starCatalog/StarCatalogId';
import type { BodyId } from '../../@types/data/body/BodyId';
import type { BlackHoleId } from '../../@types/data/blackHole/BlackHoleId';
import type { StructureId } from '../../@types/data/structure/StructureId';
import type { CosmicWebDensityFieldId } from '../../@types/data/volume/CosmicWebDensityFieldId';
import {
  setMilkyWayEnabled,
  setMilkyWayLabelEnabled,
} from '../../layers/milkyWay/state/milkyWay/slice';
import { setCosmicWebFilamentsEnabled } from '../../layers/cosmicWebFilaments/state/cosmicWebFilaments/slice';
import { setLocalBubbleEnabled } from '../../layers/localBubble/state/localBubble/slice';
import { setOrbitTrailsEnabled } from '../../state/settings/core/orbitTrails/slice';
import {
  setCosmicWebDensityEnabled,
  writeCosmicWebDensityField,
} from '../../layers/cosmicWebDensity/state/cosmicWebDensity/slice';
import { setFlowEnabled } from '../../layers/flow/state/flow/slice';
import { setConstellationsEnabled } from '../../layers/constellations/state/constellations/slice';
import {
  setGalaxyCatalogVisible,
  setGalaxyCatalogLabelEnabled,
} from '../../layers/galaxyCatalog/state/galaxyCatalogs/slice';
import { setStarCatalogLabelEnabled } from '../../layers/starCatalog/state/starCatalogs/slice';
import { setBodyLabelEnabled } from '../../layers/body/state/bodies/slice';
import { setBlackHoleLabelEnabled } from '../../layers/blackHoles/state/blackHoles/slice';
import {
  setStructureItemEnabled,
  setStructureLabelEnabled,
} from '../../layers/structure/state/structures/slice';
import { setZoneOfAvoidanceEnabled } from '../../layers/zoneOfAvoidance/state/zoneOfAvoidance/slice';

type VisibilityActionRow = {
  readonly actions: (on: boolean, settings: EngineSettingsState) => readonly Action[];
};

export const VISIBILITY_ACTION_ROW: Record<VisibilityLayerKey, VisibilityActionRow> = {
  // Gate-backed layers: a scalar `enabled` field in settings, so one action each.
  milkyWayDisk: { actions: (on) => [setMilkyWayEnabled(on)] },
  milkyWayLabel: { actions: (on) => [setMilkyWayLabelEnabled(on)] },
  cosmicWebFilaments: { actions: (on) => [setCosmicWebFilamentsEnabled(on)] },
  localBubble: { actions: (on) => [setLocalBubbleEnabled(on)] },
  orbitTrails: { actions: (on) => [setOrbitTrailsEnabled(on)] },
  cosmicWebDensity: { actions: (on) => [setCosmicWebDensityEnabled(on)] },
  flow: { actions: (on) => [setFlowEnabled(on)] },
  constellations: { actions: (on) => [setConstellationsEnabled(on)] },
  zoneOfAvoidance: { actions: (on) => [setZoneOfAvoidanceEnabled(on)] },

  // Per-item layers fan out across a `settings.<cluster>.items` record, read live
  // so the action list always reflects the current catalog set.
  survey: {
    actions: (on, settings) =>
      Object.keys(settings.galaxyCatalogs.items).map((id) =>
        setGalaxyCatalogVisible({ id: id as GalaxyCatalogId, enabled: on }),
      ),
  },

  surveyLabel: {
    actions: (on, settings) =>
      Object.keys(settings.galaxyCatalogs.items).map((id) =>
        setGalaxyCatalogLabelEnabled({ id: id as GalaxyCatalogId, enabled: on }),
      ),
  },

  starCatalogLabel: {
    actions: (on, settings) =>
      Object.keys(settings.starCatalogs.items).map((id) =>
        setStarCatalogLabelEnabled({ id: id as StarCatalogId, enabled: on }),
      ),
  },

  // The Galactic Centre caption rides the near-field key, so the cue writes
  // the black holes' label bits beside the bodies'.
  bodyLabel: {
    actions: (on, settings) => [
      ...Object.keys(settings.bodies.items).map((id) =>
        setBodyLabelEnabled({ id: id as BodyId, enabled: on }),
      ),
      ...Object.keys(settings.blackHoles.items).map((id) =>
        setBlackHoleLabelEnabled({ id: id as BlackHoleId, enabled: on }),
      ),
    ],
  },

  structureRing: {
    actions: (on, settings) =>
      Object.keys(settings.structures.items).map((id) =>
        setStructureItemEnabled({ id: id as StructureId, enabled: on }),
      ),
  },

  structureLabel: {
    actions: (on, settings) =>
      Object.keys(settings.structures.items).map((id) =>
        setStructureLabelEnabled({ id: id as StructureId, enabled: on }),
      ),
  },

  // `cosmicWebDensity.items` is a Partial record — a field is absent until
  // its slot commits — so only present ids are emitted.
  cosmicWebDensityField: {
    actions: (on, settings) =>
      Object.keys(settings.cosmicWebDensity.items).map((id) =>
        writeCosmicWebDensityField({ id: id as CosmicWebDensityFieldId, patch: { enabled: on } }),
      ),
  },

  // Registration-only: always-on or React-owned, so no settings action exists.
  proceduralDisks: { actions: () => [] },
  texturedDisks: { actions: () => [] },
  scaleBar: { actions: () => [] },
};
