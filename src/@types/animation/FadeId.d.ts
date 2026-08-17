/**
 * FadeId — discriminated union identifying any fadeable layer.
 *
 * The fade registry stores one `FadeController` per id, keyed by a
 * stable string serialization. The union is closed: every renderer or
 * subsystem that wants to participate in fade orchestration adds itself
 * by extending one of the existing kinds rather than minting an
 * ad-hoc string.
 *
 * Kinds:
 *   - galaxyCatalog — one of SDSS, 2MRS, GLADE, Famous, Synthetic.
 *                    Fades in on first load; fades out → upload → in
 *                    on tier swap. Discriminator: `id: GalaxyCatalogId`
 *                    (the string id the point renderer keys catalogs by).
 *   - structure    — the structure marker rings for one structure source
 *                    (cluster, supercluster, void, group). Discriminator:
 *                    `id: StructureId`. One controller per source so a
 *                    source's rings can fade independently of the others.
 *   - volumeField  — one volumetric scalar field (CF-4, rhizome-small,
 *                    rhizome-medium, rhizome-large). Discriminator:
 *                    `id: VolumeFieldId` (the registry id the volume
 *                    renderer keys fields by).
 *   - milkyWay     — the Milky-Way star/dust point cloud
 *                    (`milkyWayCloudRenderer`). Its fade is seeded from
 *                    `settings.milkyWay.enabled` and multiplied into the
 *                    renderer's apparent-size fade so the disk dissolves
 *                    smoothly on toggle. No discriminator.
 *   - filament     — the single cosmic-web filament skeleton. Fades in on
 *                    first load. No discriminator.
 *   - flow         — the CF4++ peculiar-velocity flow overlay. Fades in on
 *                    first load (the slot commit), like filament/galaxy catalog;
 *                    fades out on disable. No discriminator.
 *   - constellations — the true-3D constellation stick-figure overlay. A
 *                    singleton demand-loaded layer (like filament): fades in
 *                    once its artifact uploads, fades out on the master toggle.
 *                    No discriminator.
 *   - zoneOfAvoidance — the galactic-plane dust band overlay. Seeded from
 *                    `settings.zoneOfAvoidance.enabled`, which gates both
 *                    the band and its curved lettering — a single toggle,
 *                    not a band/label split. No discriminator.
 *   - orbitTrails  — the near-field Keplerian orbit trails (Earth / Jupiter /
 *                    Moon …). Seeded from `settings.orbitTrails.enabled` and
 *                    multiplied into the layer's per-orbit apparent-size alpha so
 *                    the whole trail layer dissolves smoothly on toggle. The
 *                    compile-time conic table is always present (no demand load),
 *                    so it seeds from the toggle rather than fading in at 0. No
 *                    discriminator.
 *   - labelLayer   — one logical label layer (milkyWay, structure, galaxy
 *                    names, star-map captions, scene-body captions, scale
 *                    bar). Discriminator: `layer: LabelLayerId`. A layer whose
 *                    source fans out per item additionally keys on
 *                    `item: LabelCategory` so each source's labels are a
 *                    distinct controller; singleton layers carry no item.
 *   - overlay      — always-on GPU overlay (procedural disks, textured
 *                    disks). Registered at opacity 1.0 via setImmediate.
 *                    Discriminator: `id: OverlayId`.
 *   - volumesMaster — the master enable gate for the whole scalar-
 *                    volume subsystem. Used by setVolumesEnabled and
 *                    the scalarVolumeLayer / volumeUpsampleLayer gates to
 *                    smooth the master toggle. Multiplied into each
 *                    volumeField's per-frame opacity at the call site,
 *                    so a master fade-out drags every field down with
 *                    it. No discriminator.
 *
 * Future kinds (e.g. `galaxyCatalogChunk` for chunked galaxy loading) extend
 * the union without breaking existing consumers because every consumer
 * matches on `kind` exhaustively.
 *
 * All fields are `readonly` because ids are values used as map keys
 * and must not be mutated after construction.
 */

import type { StructureId } from '../data/structure/StructureId';
import type { GalaxyCatalogId } from '../data/galaxyCatalog/GalaxyCatalogId';
import type { VolumeFieldId } from '../data/volume/VolumeFieldId';
import type { LabelCategory } from '../engine/data/LabelCategory';
import type { LabelLayerId } from './LabelLayerId';
import type { OverlayId } from './OverlayId';

export type FadeId =
  | { readonly kind: 'galaxyCatalog'; readonly id: GalaxyCatalogId }
  | { readonly kind: 'structure'; readonly id: StructureId }
  | { readonly kind: 'volumeField'; readonly id: VolumeFieldId }
  | { readonly kind: 'milkyWay' }
  | { readonly kind: 'filament' }
  | { readonly kind: 'flow' }
  | { readonly kind: 'constellations' }
  | { readonly kind: 'orbitTrails' }
  | { readonly kind: 'zoneOfAvoidance' }
  | {
      readonly kind: 'labelLayer';
      readonly layer: LabelLayerId;
      readonly item?: LabelCategory;
    }
  | { readonly kind: 'overlay'; readonly id: OverlayId }
  | { readonly kind: 'volumesMaster' };
