/**
 * visibilityActionRow — a DATA TABLE mapping every VisibilityLayerKey to the
 * settings write it drives (`writes`, `null` for registration-only layers) and the
 * factory computing that write's actions. `FADE_ROW` is derived below from `writes`.
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
import type { StructureId } from '../../@types/data/structure/StructureId';
import type { VolumeFieldId } from '../../@types/data/volume/VolumeFieldId';
import {
  setMilkyWayEnabled,
  setMilkyWayLabelEnabled,
  setFilamentsEnabled,
  setOrbitTrailsEnabled,
  setVolumesEnabled,
  setFlowEnabled,
  setConstellationsEnabled,
  setGalaxyCatalogVisible,
  setGalaxyCatalogLabelEnabled,
  setStarCatalogLabelEnabled,
  setBodyLabelEnabled,
  setStructureItemEnabled,
  setStructureLabelEnabled,
  writeVolumeField,
  setZoneOfAvoidanceEnabled,
} from '../../state/settings/settingsSlice';

type VisibilityActionRow = {
  /** The settings creator this layer writes; `null` for registration-only layers. */
  readonly writes: { readonly type: string } | null;
  readonly actions: (on: boolean, settings: EngineSettingsState) => readonly Action[];
};

export const VISIBILITY_ACTION_ROW: Record<VisibilityLayerKey, VisibilityActionRow> = {
  // Gate-backed layers: a scalar `enabled` field in settings, so one action each.
  milkyWayDisk: { writes: setMilkyWayEnabled, actions: (on) => [setMilkyWayEnabled(on)] },
  milkyWayLabel: {
    writes: setMilkyWayLabelEnabled,
    actions: (on) => [setMilkyWayLabelEnabled(on)],
  },
  filaments: { writes: setFilamentsEnabled, actions: (on) => [setFilamentsEnabled(on)] },
  orbitTrails: { writes: setOrbitTrailsEnabled, actions: (on) => [setOrbitTrailsEnabled(on)] },
  volumesMaster: { writes: setVolumesEnabled, actions: (on) => [setVolumesEnabled(on)] },
  flow: { writes: setFlowEnabled, actions: (on) => [setFlowEnabled(on)] },
  constellations: {
    writes: setConstellationsEnabled,
    actions: (on) => [setConstellationsEnabled(on)],
  },
  zoneOfAvoidance: {
    writes: setZoneOfAvoidanceEnabled,
    actions: (on) => [setZoneOfAvoidanceEnabled(on)],
  },

  // Per-item layers fan out across a `settings.<cluster>.items` record, read live
  // so the action list always reflects the current catalog set.
  survey: {
    writes: setGalaxyCatalogVisible,
    actions: (on, settings) =>
      Object.keys(settings.galaxyCatalogs.items).map((id) =>
        setGalaxyCatalogVisible({ id: id as GalaxyCatalogId, enabled: on }),
      ),
  },

  surveyLabel: {
    writes: setGalaxyCatalogLabelEnabled,
    actions: (on, settings) =>
      Object.keys(settings.galaxyCatalogs.items).map((id) =>
        setGalaxyCatalogLabelEnabled({ id: id as GalaxyCatalogId, enabled: on }),
      ),
  },

  starCatalogLabel: {
    writes: setStarCatalogLabelEnabled,
    actions: (on, settings) =>
      Object.keys(settings.starCatalogs.items).map((id) =>
        setStarCatalogLabelEnabled({ id: id as StarCatalogId, enabled: on }),
      ),
  },

  bodyLabel: {
    writes: setBodyLabelEnabled,
    actions: (on, settings) =>
      Object.keys(settings.bodies.items).map((id) =>
        setBodyLabelEnabled({ id: id as BodyId, enabled: on }),
      ),
  },

  structureRing: {
    writes: setStructureItemEnabled,
    actions: (on, settings) =>
      Object.keys(settings.structures.items).map((id) =>
        setStructureItemEnabled({ id: id as StructureId, enabled: on }),
      ),
  },

  structureLabel: {
    writes: setStructureLabelEnabled,
    actions: (on, settings) =>
      Object.keys(settings.structures.items).map((id) =>
        setStructureLabelEnabled({ id: id as StructureId, enabled: on }),
      ),
  },

  // `volumes.items` is a Partial record — a field is absent until its slot
  // commits — so only present ids are emitted.
  volumeField: {
    writes: writeVolumeField,
    actions: (on, settings) =>
      Object.keys(settings.volumes.items).map((id) =>
        writeVolumeField({ id: id as VolumeFieldId, patch: { enabled: on } }),
      ),
  },

  // Registration-only: always-on or React-owned, so no settings action exists.
  proceduralDisks: { writes: null, actions: () => [] },
  texturedDisks: { writes: null, actions: () => [] },
  scaleBar: { writes: null, actions: () => [] },
};

/**
 * FADE_ROW — derived inverse of VISIBILITY_ACTION_ROW: write-action type
 * string → the VisibilityLayerKey it drives. watchFadesSaga looks this up by
 * action.type to fire `syncFades` for the one affected layer.
 */
export const FADE_ROW: Partial<Record<string, VisibilityLayerKey>> = Object.fromEntries(
  Object.entries(VISIBILITY_ACTION_ROW)
    .filter(
      (entry): entry is [VisibilityLayerKey, VisibilityActionRow & { writes: { type: string } }] =>
        entry[1].writes !== null,
    )
    .map(([key, row]) => [row.writes.type, key]),
);
