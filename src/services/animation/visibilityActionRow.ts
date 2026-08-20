/**
 * visibilityActionRow — a DATA TABLE mapping every VisibilityLayerKey to the
 * settings write it drives (`writes`, `null` for registration-only layers)
 * and the per-item factory that computes that write's actions (`actions`).
 * `FADE_ROW` (watchFadesSaga's action.type → VisibilityLayerKey lookup) is
 * derived below from `writes` — see its own comment for why it isn't
 * derived from `actions` instead.
 *
 * ### Why (on, settings) => Action[] instead of (on) => SettingsAction
 *
 * Per-item layers (survey, structureRing, etc.) need the current settings
 * state to enumerate existing item ids and emit ONE action per item. A
 * singular return type cannot express that: `show(['survey'])` must dispatch
 * `setGalaxyCatalogVisible({ id, enabled:true })` for every catalog id in
 * `settings.galaxyCatalogs.items`. Gate-backed layers (single boolean actions)
 * ignore `settings` and return a one-element array — the factory shape is
 * uniform across both kinds.
 *
 * ### Registration-only layers
 *
 * `proceduralDisks`, `texturedDisks`, and `scaleBar` have NO settings action —
 * their visibility is not settings-driven (they are always on, or React-owned).
 * Their factories return an empty array `[]` so the table is TOTAL (every
 * VisibilityLayerKey resolves to a function) and the show/hide loop never has
 * to branch on "does this key have actions?".
 *
 * ### Action element type
 *
 * The factories return `readonly Action[]` using RTK's `Action` (= `{type:
 * string}`). The actual payloads are precise RTK actions produced by the
 * settings slice creators; `Action` is the dispatch-compatible supertype.
 * These actions are dispatched verbatim to the store, so payload-precise typing
 * is unnecessary here — the slice creators enforce payload correctness at their
 * own call sites.
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

/**
 * VISIBILITY_ACTION_ROW — total record mapping every VisibilityLayerKey to
 * its `writes` creator and its `actions` factory `(on, settings) => readonly
 * Action[]`.
 *
 * Callers (applySceneEffect's show/hide arms) iterate the effect's layers,
 * look up each layer's factory, and dispatch every returned action. The bridge
 * (`syncVisibilityFades`) is called after all actions are dispatched so the
 * fade reflects the new intent.
 */
export const VISIBILITY_ACTION_ROW: Record<VisibilityLayerKey, VisibilityActionRow> = {
  // ── Gate-backed layers (single boolean action) ─────────────────────────
  // These layers have a scalar `enabled` field in settings; one action suffices.

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

  // ── Per-item layers (one action per registered item) ────────────────────
  // These layers fan out across a `settings.<cluster>.items` record. The factory
  // reads the current item ids from settings so the action list always reflects
  // the live catalog set — no hardcoded id list to keep in sync.

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

  // volumeField uses `writeVolumeField` with a `{ enabled }` patch. The
  // `enabled` field is `DataItemSettings.enabled`, the per-item visibility axis
  // shared by all source-type clusters. `items` is a Partial record (fields may
  // be absent until the volume's slot commits), so only present ids are emitted.
  volumeField: {
    writes: writeVolumeField,
    actions: (on, settings) =>
      Object.keys(settings.volumes.items).map((id) =>
        writeVolumeField({ id: id as VolumeFieldId, patch: { enabled: on } }),
      ),
  },

  // ── Registration-only layers (no settings action) ───────────────────────
  // proceduralDisks, texturedDisks, and scaleBar are always-on overlays (or
  // React-owned). Their visibility is not controlled by settings actions, so the
  // factory returns [] — a no-op. The table stays TOTAL: every key resolves to
  // a row; the show/hide loop dispatches nothing for these layers, which is
  // the correct behaviour.

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
    .filter((entry): entry is [VisibilityLayerKey, VisibilityActionRow & { writes: { type: string } }] =>
      entry[1].writes !== null,
    )
    .map(([key, row]) => [row.writes.type, key]),
);
