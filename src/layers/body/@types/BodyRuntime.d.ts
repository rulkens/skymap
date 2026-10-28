import type { EarthRenderer } from './EarthRenderer';
import type { SurfaceTileRenderer } from './SurfaceTileRenderer';
import type { TerrainPickMarkerRenderer } from './TerrainPickMarkerRenderer';
import type { TexturedBodyRenderer } from './TexturedBodyRenderer';
import type { PlanetRenderer } from './PlanetRenderer';
import type { RingRenderer } from './RingRenderer';
import type { CloudShellRenderer } from './CloudShellRenderer';
import type { AtmosphereShellRenderer } from './AtmosphereShellRenderer';
import type { BodyGlintRenderer } from '../../../@types/rendering/BodyGlintRenderer';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { BodyTextureReq } from '../../../@types/loading/BodyTextureReq';
import type { BodyTextureSlotKey } from '../../../@types/data/BodyTextureSlotKey';
import type { SurfaceTileStream } from './SurfaceTileStream';
import type { SurfaceTilePlan } from './SurfaceTilePlan';
import type { BodyFacts } from './BodyFacts';
import type { TrailingThrottle } from '../../../@types/utils/TrailingThrottle';

/** The Layer's whole runtime. Non-null: `create` builds it before returning. */
export type BodyRuntime = {
  readonly earthRenderer: EarthRenderer;
  readonly surfaceTileRenderer: SurfaceTileRenderer;
  readonly terrainPickMarkerRenderer: TerrainPickMarkerRenderer;
  readonly texturedBodyRenderer: TexturedBodyRenderer;
  readonly planetRenderer: PlanetRenderer;
  readonly ringRenderer: RingRenderer;
  readonly cloudShellRenderer: CloudShellRenderer;
  /** Owns the aerial-perspective renderer and the sky-view LUT. */
  readonly atmosphereShellRenderer: AtmosphereShellRenderer;
  readonly bodyGlintRenderer: BodyGlintRenderer;
  /** One slot per `(bodyId, kind)` map; their commits write the renderers above. */
  readonly textureSlots: ReadonlyMap<BodyTextureSlotKey, AssetSlot<ImageBitmap, BodyTextureReq>>;
  /** The all-bodies placeholder atlas, seeding every textured body before its own map lands. */
  readonly atlasSlot: AssetSlot<ImageBitmap, void>;
  /** The stream owns residency; `plan` is the last planned frame's, written only by
   * `surfaceTilePlanner` and read by the passes, capture faces and the terrain seam. */
  readonly surfaceTiles: { readonly stream: SurfaceTileStream; plan: SurfaceTilePlan };
  readonly publish: (patch: Partial<BodyFacts>) => void;
  /** Gates the tile readout: nothing is published while no one can read it. */
  readonly debugPanelOpen: () => boolean;
  /** Paces the tile readout; a turned-away publish wakes one more frame once it reopens. */
  readonly readoutGate: TrailingThrottle;
};
