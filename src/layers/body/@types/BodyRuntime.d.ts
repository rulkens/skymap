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

/** The Layer's whole runtime. Non-null: `create` builds it before returning. */
export type BodyRuntime = {
  readonly earth: EarthRenderer;
  readonly surfaceTile: SurfaceTileRenderer;
  readonly terrainPickMarker: TerrainPickMarkerRenderer;
  readonly texturedBody: TexturedBodyRenderer;
  readonly planet: PlanetRenderer;
  readonly ring: RingRenderer;
  readonly cloudShell: CloudShellRenderer;
  /** Owns the aerial-perspective renderer and the sky-view LUT. */
  readonly atmosphere: AtmosphereShellRenderer;
  readonly glint: BodyGlintRenderer;
  /** One slot per `(bodyId, kind)` map; their commits write the renderers above. */
  readonly textureSlots: ReadonlyMap<BodyTextureSlotKey, AssetSlot<ImageBitmap, BodyTextureReq>>;
  /** The all-bodies placeholder atlas, seeding every textured body before its own map lands. */
  readonly atlasSlot: AssetSlot<ImageBitmap, void>;
};
