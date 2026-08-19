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
 * finer key vocabulary.
 *
 * ### Two tables, one branch
 *
 * The mapping is constant per kind, so it lives in data rather than in
 * control flow. A nested switch would express the same lookup as ~70 lines
 * of `case`/`return`, burying the one genuinely conditional thing —
 * `labelLayer` is the only kind carrying a sub-discriminator — under ten
 * arms that do nothing but return a literal. Two tables plus one two-way
 * branch says exactly that, and the per-row comments stay attached to the
 * rows they explain instead of to `case` labels.
 *
 * ### Exhaustiveness discipline
 *
 * `satisfies Record<K, V>` is the guard, and it is stronger than a
 * `never`-assignment `default` arm would be: a `Record` cannot be
 * satisfied by omission, so adding a member to `FadeId['kind']` or to
 * `LabelLayerId` makes the table a compile error until the new member
 * declares its clip stance. `satisfies` (not a type annotation) is what
 * keeps the literal value types, so indexing still yields a narrow
 * `VisibilityLayerKey` rather than a widened `string`.
 */

import type { FadeId } from '../../../@types/animation/FadeId';
import type { LabelLayerId } from '../../../@types/animation/LabelLayerId';
import type { VisibilityLayerKey } from '../../../@types/animation/VisibilityLayerKey';

/**
 * Clip-layer address per label layer. Layers whose source fans out per item
 * (`h.item`) still collapse to a single key: a clip cue targeting labels fades
 * every item's captions in that layer together.
 */
const VISIBILITY_KEY_BY_LABEL_LAYER = {
  milkyWay: 'milkyWayLabel',
  galaxy: 'surveyLabel',
  scaleBar: 'scaleBar',
  // Per-item structure labels collapse here — the clip channel targets all
  // structure labels together.
  structure: 'structureLabel',
  // Per-item star-catalog captions collapse the same way: a cue targeting the
  // star map fades every catalog's captions at once.
  starCatalog: 'starCatalogLabel',
  // Per-item body captions likewise: one cue for all near-field captions.
  body: 'bodyLabel',
} satisfies Record<LabelLayerId, VisibilityLayerKey>;

/**
 * Clip-layer address per `FadeId` kind, for the kinds with no sub-discriminator
 * that changes the answer. `undefined` means "no clip-layer address" → factor 1.
 */
const VISIBILITY_KEY_BY_KIND = {
  // Every galaxy catalog source maps to the single `survey` clip key.
  galaxyCatalog: 'survey',
  // All structure sources (cluster, supercluster, void, group) collapse to
  // `structureRing`; per-source clip targeting is deferred.
  structure: 'structureRing',
  // Each volume field maps to `volumeField`; the clip factor applies uniformly
  // across all active volume fields.
  volumeField: 'volumeField',
  milkyWay: 'milkyWayDisk',
  filament: 'filaments',
  flow: 'flow',
  constellations: 'constellations',
  orbitTrails: 'orbitTrails',
  zoneOfAvoidance: 'zoneOfAvoidance',
  // Always-on GPU overlays (`proceduralDisks`, `texturedDisks`) have a
  // VisibilityLayerKey address, but reaching it needs the `id` discriminator,
  // and a tour cue targets those keys directly instead of arriving through a
  // rendered `FadeId`. Conservative until a clip actually needs per-frame
  // overlay dimming; routing by `id` is then a one-row change.
  overlay: undefined,
  volumesMaster: 'volumesMaster',
} satisfies Record<Exclude<FadeId['kind'], 'labelLayer'>, VisibilityLayerKey | undefined>;

/**
 * Maps a `FadeId` to its `VisibilityLayerKey`, or `undefined` for ids with no
 * clip-layer address — the `overlay` kind alone.
 *
 * Exhaustive over `FadeId['kind']` and over `LabelLayerId` through the two
 * tables' `satisfies Record<…>` constraints: a new union member is a compile
 * error until it declares its clip stance.
 */
export function fadeIdToVisibilityKey(h: FadeId): VisibilityLayerKey | undefined {
  return h.kind === 'labelLayer'
    ? VISIBILITY_KEY_BY_LABEL_LAYER[h.layer]
    : VISIBILITY_KEY_BY_KIND[h.kind];
}
