import type { BuildPointInterleavedBufferInput } from '../../../@types/engine/BuildPointInterleavedBufferInput';
import type { BuildPointInterleavedBufferResult } from '../../../@types/engine/BuildPointInterleavedBufferResult';

/**
 * How a catalog's interleaved vertex buffer gets baked. Production hands over
 * `defaultWorkerRunner`; Node tests inject a synchronous function (`Worker`
 * doesn't exist there).
 */
export type BuildRunner = (
  input: BuildPointInterleavedBufferInput,
) => Promise<BuildPointInterleavedBufferResult>;
