import type { BuildPointInterleavedBufferInput } from './BuildPointInterleavedBufferInput';
import type { BuildPointInterleavedBufferResult } from './BuildPointInterleavedBufferResult';

/**
 * How a catalog's interleaved vertex buffer gets baked. Production hands over
 * `defaultWorkerRunner`; Node tests inject a synchronous function (`Worker`
 * doesn't exist there).
 */
export type BuildRunner = (
  input: BuildPointInterleavedBufferInput,
) => Promise<BuildPointInterleavedBufferResult>;
