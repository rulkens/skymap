import type { EarthRenderer } from '../earth/@types/EarthRenderer';
import type { SurfaceTileRenderer } from '../surfaceTiles/patch/@types/SurfaceTileRenderer';
import type { TerrainPickCursor } from '../terrainPick/@types/TerrainPickCursor';
import type { TerrainPickMarkerRenderer } from '../terrainPick/@types/TerrainPickMarkerRenderer';
import type { TexturedBodyRenderer } from '../spheres/@types/TexturedBodyRenderer';
import type { PlanetRenderer } from '../spheres/@types/PlanetRenderer';
import type { RingRenderer } from '../rings/@types/RingRenderer';
import type { CloudShellRenderer } from '../clouds/@types/CloudShellRenderer';
import type { AtmosphereShellRenderer } from '../atmosphere/@types/AtmosphereShellRenderer';
import type { BodyGlintRenderer } from '../../../@types/rendering/BodyGlintRenderer';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { BodyTextureReq } from '../textures/@types/BodyTextureReq';
import type { BodyTextureSlotKey } from '../../../@types/data/BodyTextureSlotKey';
import type { SurfaceTileStream } from '../surfaceTiles/stream/@types/SurfaceTileStream';
import type { SurfaceTilePlan } from '../surfaceTiles/plan/@types/SurfaceTilePlan';
import type { BodyFacts } from './BodyFacts';
import type { TrailingThrottle } from '../../../@types/utils/TrailingThrottle';

/** The Layer's whole runtime. Non-null: `create` builds it before returning. */
export type BodyRuntime = {
  readonly earthRenderer: EarthRenderer;
  readonly surfaceTileRenderer: SurfaceTileRenderer;
  readonly terrainPickMarkerRenderer: TerrainPickMarkerRenderer;
  readonly terrainPickCursor: TerrainPickCursor;
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
  readonly debugPanelOpen: () => boolean;
  readonly readoutGate: TrailingThrottle;
};
