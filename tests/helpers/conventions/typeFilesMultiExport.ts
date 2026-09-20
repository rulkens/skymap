/**
 * `typeFilesAreDeclarations.test.ts`'s debt ledger: `@types/` files exporting
 * more than one type. Built empirically off the current tree — splitting one
 * of these must drop its row in the same change, or the ratchet test fails on
 * the row that no longer violates.
 */
export const TYPE_FILES_MULTI_EXPORT: ReadonlySet<string> = new Set([
  'src/@types/animation/CompiledClip.d.ts',
  'src/@types/data/structure/StructureCatalog.d.ts',
  'src/@types/engine/handles/EngineDebugHandle.d.ts',
  'src/@types/engine/subsystems/HiResFamousSubsystem.d.ts',
  'src/@types/engine/subsystems/ProceduralDiskSubsystem.d.ts',
  'src/@types/engine/subsystems/TexturedDiskSubsystem.d.ts',
  'src/@types/engine/subsystems/TileStreamSubsystem.d.ts',
  'src/@types/loading/StructureCatalogPayload.d.ts',
  'src/@types/rendering/BodyPickRenderer.d.ts',
  'src/@types/rendering/HiResFamousTexture.d.ts',
  'src/@types/rendering/StarCatalogPickRenderer.d.ts',
  'src/@types/rendering/StarCatalogRenderer.d.ts',
  'src/@types/rendering/SurfaceTileRenderer.d.ts',
  'tools/mcpm-workbench/@types/HistogramSlice.d.ts',
]);
