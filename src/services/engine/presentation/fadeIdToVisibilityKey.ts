/**
 * fadeIdToVisibilityKey — the inverse bridge from `FadeId` to
 * `VisibilityLayerKey`, for the clip-opacity third factor.
 *
 * ### Two vocabularies, one bridge
 *
 * `FadeId` is the registry vocabulary — shaped for the renderer, with
 * discriminators (`GalaxyCatalogId`, `StructureId`, `VolumeFieldId`) where
 * a subsystem owns many controllers. `VisibilityLayerKey` is the
 * intent-addressing vocabulary — the friendly names a cinematic-tour cue
 * thinks in, intentionally finer-grained (e.g. `milkyWayDisk` vs
 * `milkyWayLabel` split the `milkyWay` kind; `structureRing` vs
 * `structureLabel` split `structure`).
 *
 * `FadeLayer.handle()` maps VisibilityLayerKey → FadeId at registration;
 * this function is its approximate inverse, used at render time to look up
 * the `ClipPlayer.clipOpacityOf` channel. It is deliberately approximate
 * rather than exact: several `FadeId` discriminators collapse to one key
 * (every `StructureId` → `'structureRing'`; every `GalaxyCatalogId` →
 * `'survey'`), because a clip cue targeting `structureRing` fades ALL
 * structure rings uniformly. Per-instance clip opacity would require a
 * finer key vocabulary — deferred to a later plan.
 *
 * ### Exhaustiveness discipline
 *
 * The outer `switch (h.kind)` has NO `default` arm — every
 * `FadeId['kind']` union member is handled explicitly. This mirrors
 * `recessionTargetFor` (focusRecession.ts:70-94): adding a new kind to
 * `FadeId` becomes a compile error here until the new kind declares its
 * clip stance, rather than silently returning `undefined` at runtime.
 *
 * ### Why `overlay` returns `undefined`
 *
 * `overlay` layers (`proceduralDisks`, `texturedDisks`) are always-on GPU
 * overlays. Their VisibilityLayerKey address exists (`proceduralDisks`,
 * `texturedDisks`), but a tour cue targets those keys directly — the clip
 * channel consults this bridge via a rendered `FadeId`, and the overlay
 * `id` discriminator would be needed to route them. For now the overlay
 * kind returns `undefined` → factor 1. This is conservative: overlays
 * rarely need per-frame clip dimming, and upgrading to the discriminated
 * path is a one-line change when needed.
 *
 * ### `labelLayer` sub-switch
 *
 * The `labelLayer` kind splits into four keys by `LabelLayerId`. The inner
 * switch is exhaustive over the four members so the compiler reports a
 * missing case if `LabelLayerId` is extended.
 */

import type { FadeId } from '../../../@types/animation/FadeId';
import type { VisibilityLayerKey } from '../../../@types/animation/VisibilityLayerKey';

/**
 * Maps a `FadeId` to its `VisibilityLayerKey`, or `undefined` for kinds
 * with no clip-layer address (`overlay`).
 *
 * Exhaustive over `FadeId['kind']` with no `default` arm — a new union
 * kind must declare its clip stance here or tsc fails.
 */
export function fadeIdToVisibilityKey(h: FadeId): VisibilityLayerKey | undefined {
  switch (h.kind) {
    case 'galaxyCatalog':
      // Every galaxy catalog source maps to the single `survey` clip key.
      return 'survey';
    case 'structure':
      // All structure sources (cluster, supercluster, void, group) collapse
      // to `structureRing`; per-source clip targeting is deferred.
      return 'structureRing';
    case 'volumeField':
      // Each volume field maps to `volumeField`; the clip factor applies
      // uniformly across all active volume fields.
      return 'volumeField';
    case 'milkyWay':
      return 'milkyWayDisk';
    case 'filament':
      return 'filaments';
    case 'flow':
      return 'flow';
    case 'labelLayer': {
      // Inner switch is exhaustive over LabelLayerId — no default arm.
      // Adding a new LabelLayerId becomes a compile error here.
      switch (h.layer) {
        case 'milkyWay':
          return 'milkyWayLabel';
        case 'galaxyNames':
          return 'surveyLabel';
        case 'scaleBar':
          return 'scaleBar';
        case 'structure':
          // A per-category structure label (h.category) still maps to the
          // single `structureLabel` key — the clip channel targets all
          // structure labels together.
          return 'structureLabel';
      }
    }
    case 'overlay':
      // Always-on GPU overlays: no clip-layer address via this bridge.
      // Tour cues target these by VisibilityLayerKey directly. → factor 1.
      return undefined;
    case 'volumesMaster':
      return 'volumesMaster';
  }
}
