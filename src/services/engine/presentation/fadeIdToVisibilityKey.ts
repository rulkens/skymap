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
 * The outer `switch (h.kind)` has a `default` arm that assigns `h` to a
 * `never`-typed variable. Adding a new `FadeId['kind']` union member causes
 * tsc to reject that assignment — the new kind must declare its clip stance
 * here or the build fails. This mirrors the guard pattern in
 * `compileClip.ts:207-211`.
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
 * The `labelLayer` kind splits by `LabelLayerId`. The inner switch has its own
 * `never`-guard `default` arm — extending `LabelLayerId` is a compile error
 * here, so a new label layer must declare its clip stance.
 */

import type { FadeId } from '../../../@types/animation/FadeId';
import type { VisibilityLayerKey } from '../../../@types/animation/VisibilityLayerKey';

/**
 * Maps a `FadeId` to its `VisibilityLayerKey`, or `undefined` for ids with no
 * clip-layer address: the `overlay` kind, and the near-field caption label
 * layers (`starCatalog`, `body`).
 *
 * Exhaustive over `FadeId['kind']` via a `never`-guard `default` arm — a
 * new union kind must declare its clip stance here or tsc fails.
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
    case 'constellations':
      return 'constellations';
    case 'orbitTrails':
      return 'orbitTrails';
    case 'labelLayer': {
      switch (h.layer) {
        case 'milkyWay':
          return 'milkyWayLabel';
        case 'galaxy':
          return 'surveyLabel';
        case 'scaleBar':
          return 'scaleBar';
        case 'structure':
          // A per-item structure label (h.item) still maps to the single
          // `structureLabel` key — the clip channel targets all structure
          // labels together.
          return 'structureLabel';
        case 'starCatalog':
        case 'body':
          // Near-field caption layers have no VisibilityLayerKey of their own,
          // so no clip cue addresses them through this bridge → factor 1. Same
          // conservative stance as the `overlay` kind below.
          return undefined;
        // TypeScript exhaustiveness guard — a new LabelLayerId must map a key here.
        default: {
          const _exhaustive: never = h.layer;
          throw new Error(`unhandled LabelLayerId: ${JSON.stringify(_exhaustive)}`);
        }
      }
    }
    case 'overlay':
      // Always-on GPU overlays: no clip-layer address via this bridge.
      // Tour cues target these by VisibilityLayerKey directly. → factor 1.
      return undefined;
    case 'volumesMaster':
      return 'volumesMaster';
    // TypeScript exhaustiveness guard — the union is closed.
    default: {
      const _exhaustive: never = h;
      throw new Error(`unhandled FadeId kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
