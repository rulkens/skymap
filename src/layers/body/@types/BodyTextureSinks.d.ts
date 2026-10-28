import type { BodyRuntime } from './BodyRuntime';

/** The renderers a body-texture slot's commit and release write into. */
export type BodyTextureSinks = Pick<
  BodyRuntime,
  'earth' | 'cloudShell' | 'texturedBody' | 'ring' | 'atmosphere'
>;
