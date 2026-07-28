/**
 * VisibilityLayerKey — the intent-addressing vocabulary for fadeable layers.
 *
 * Two vocabularies describe the same set of fadeable things, at different
 * granularities and for different audiences:
 *
 *   - `FadeId` kinds are the *registry* vocabulary. They key the fade
 *     controller map and are shaped for the renderer: one `kind` per
 *     subsystem, with discriminators (`GalaxyCatalogId`, `StructureId`,
 *     `VolumeFieldId`) where a subsystem owns many controllers.
 *
 *   - `VisibilityLayerKey` (this type) is the *intent-addressing*
 *     vocabulary. These are the friendly names a caller reaches for when
 *     it wants to say "fade the Milky-Way label" or "fade the structure
 *     rings" — the units a human (or a cinematic-tour cue) thinks in.
 *
 * The intent vocabulary is deliberately *finer-grained* than `FadeId`
 * kinds, because an intent row can split a single kind:
 *
 *   - the `milkyWay` kind splits into two keys — `milkyWayDisk` (the
 *     star/dust point cloud) and `milkyWayLabel` (its text label) —
 *     because a tour may want to fade the label without the disk.
 *   - the `structure` kind splits into `structureRing` (the marker rings)
 *     and `structureLabel` (the category labels), for the same reason.
 *
 * The two vocabularies are bridged at exactly one place: a
 * `FadeLayer.handle()` closure maps a layer's `Item` to the concrete
 * `FadeId` it registers under. Nothing else translates between the two —
 * keeping the translation in one closure per row is what lets the seed
 * loop stay a single generic pass over the table.
 *
 * Why pin the vocabulary here rather than derive it: later plans address
 * layers *by these keys*. The intent bridge (settings ⇄ fade) and the
 * cinematic tour both take a `VisibilityLayerKey` as their public handle,
 * so the set must be a stable, hand-curated enumeration of *intents*, not
 * a mechanical mirror of the registry. A mechanical mirror would re-fuse
 * the kinds we just split (disk vs label) and lose the addressability the
 * tour depends on.
 *
 * Note on `surveyLabel`: it is the `galaxy`-handle row — a single
 * famous-catalog label toggle, NOT a per-catalog row. There is one survey
 * label intent across all galaxy catalogs, mirroring how `FadeId`'s
 * `labelLayer` reuses the `galaxy` layer for famous-galaxy labels.
 */

export type VisibilityLayerKey =
  | 'milkyWayDisk'
  | 'proceduralDisks'
  | 'texturedDisks'
  | 'volumesMaster'
  | 'milkyWayLabel'
  | 'surveyLabel'
  | 'scaleBar'
  | 'structureRing'
  | 'structureLabel'
  | 'survey'
  | 'filaments'
  | 'flow'
  | 'constellations'
  | 'orbitTrails'
  | 'volumeField';
