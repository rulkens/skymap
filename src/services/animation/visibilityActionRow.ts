/**
 * visibilityActionRow — the inverse of FADE_ROW: a DATA TABLE mapping every
 * VisibilityLayerKey to a per-item factory that returns the settings actions
 * needed to flip that layer's visibility intent.
 *
 * ### Why this is FADE_ROW's inverse
 *
 * `FADE_ROW` (watchFadesSaga.ts) maps action.type → VisibilityLayerKey,
 * answering "which layer does this write affect?" `VISIBILITY_ACTION_ROW`
 * inverts that question: given a layer and a desired on/off state, which
 * settings actions should be dispatched? These two tables are the two
 * directions of the same intent ↔ action correspondence; keeping them
 * both as flat DATA TABLES (not branch chains) is the simplicity.md §7
 * convention.
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

/**
 * VISIBILITY_ACTION_ROW — total record mapping every VisibilityLayerKey to a
 * factory `(on, settings) => readonly Action[]`.
 *
 * Callers (applySceneEffect's show/hide arms) iterate the effect's layers,
 * look up each layer's factory, and dispatch every returned action. The bridge
 * (`syncVisibilityFades`) is called after all actions are dispatched so the
 * fade reflects the new intent.
 */
export const VISIBILITY_ACTION_ROW: Record<
  VisibilityLayerKey,
  (on: boolean, settings: EngineSettingsState) => readonly Action[]
> = {
  // ── Gate-backed layers (single boolean action) ─────────────────────────
  // These layers have a scalar `enabled` field in settings; one action suffices.

  milkyWayDisk: (on) => [setMilkyWayEnabled(on)],
  milkyWayLabel: (on) => [setMilkyWayLabelEnabled(on)],
  filaments: (on) => [setFilamentsEnabled(on)],
  orbitTrails: (on) => [setOrbitTrailsEnabled(on)],
  volumesMaster: (on) => [setVolumesEnabled(on)],
  flow: (on) => [setFlowEnabled(on)],
  constellations: (on) => [setConstellationsEnabled(on)],
  zoneOfAvoidance: (on) => [setZoneOfAvoidanceEnabled(on)],

  // ── Per-item layers (one action per registered item) ────────────────────
  // These layers fan out across a `settings.<cluster>.items` record. The factory
  // reads the current item ids from settings so the action list always reflects
  // the live catalog set — no hardcoded id list to keep in sync.

  survey: (on, settings) =>
    Object.keys(settings.galaxyCatalogs.items).map((id) =>
      setGalaxyCatalogVisible({ id: id as GalaxyCatalogId, enabled: on }),
    ),

  surveyLabel: (on, settings) =>
    Object.keys(settings.galaxyCatalogs.items).map((id) =>
      setGalaxyCatalogLabelEnabled({ id: id as GalaxyCatalogId, enabled: on }),
    ),

  starCatalogLabel: (on, settings) =>
    Object.keys(settings.starCatalogs.items).map((id) =>
      setStarCatalogLabelEnabled({ id: id as StarCatalogId, enabled: on }),
    ),

  bodyLabel: (on, settings) =>
    Object.keys(settings.bodies.items).map((id) =>
      setBodyLabelEnabled({ id: id as BodyId, enabled: on }),
    ),

  structureRing: (on, settings) =>
    Object.keys(settings.structures.items).map((id) =>
      setStructureItemEnabled({ id: id as StructureId, enabled: on }),
    ),

  structureLabel: (on, settings) =>
    Object.keys(settings.structures.items).map((id) =>
      setStructureLabelEnabled({ id: id as StructureId, enabled: on }),
    ),

  // volumeField uses `writeVolumeField` with a `{ enabled }` patch — the same
  // action FADE_ROW maps from `writeVolumeField.type` to `'volumeField'`. The
  // `enabled` field is `DataItemSettings.enabled`, the per-item visibility axis
  // shared by all source-type clusters. `items` is a Partial record (fields may
  // be absent until the volume's slot commits), so only present ids are emitted.
  volumeField: (on, settings) =>
    Object.keys(settings.volumes.items).map((id) =>
      writeVolumeField({ id: id as VolumeFieldId, patch: { enabled: on } }),
    ),

  // ── Registration-only layers (no settings action) ───────────────────────
  // proceduralDisks, texturedDisks, and scaleBar are always-on overlays (or
  // React-owned). Their visibility is not controlled by settings actions, so the
  // factory returns [] — a no-op. The table stays TOTAL: every key resolves to
  // a function; the show/hide loop dispatches nothing for these layers, which is
  // the correct behaviour.

  proceduralDisks: () => [],
  texturedDisks: () => [],
  scaleBar: () => [],
};
