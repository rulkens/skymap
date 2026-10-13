import type { SourceType } from '../../../@types/data/SourceType';
import type { StarCatalogRuntime } from '../@types/StarCatalogRuntime';
import type { StarResidency } from '../../../@types/data/starCatalog/StarResidency';

/** A source's resident chunks, looked up per call: a tier reload replaces the stream. */
export function starResidency(
  runtime: Pick<StarCatalogRuntime, 'chunkStreams'>,
  source: SourceType,
): StarResidency {
  return {
    chunk: (id) => runtime.chunkStreams.get(source)?.resident(id) ?? null,
    chunkOfRecord: (ordinal) => runtime.chunkStreams.get(source)?.residentOfRecord(ordinal) ?? null,
  };
}
