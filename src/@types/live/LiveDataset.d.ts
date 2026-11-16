import type { BodyTextureId } from '../data/BodyTextureId';
import type { TextureKind } from '../data/TextureKind';
import type { LiveFile } from './LiveFile';

/** One nightly-built dataset. */
export type LiveDataset = {
  /** R2 folder name. */
  id: string;
  /** npm script that writes the live layout under public/data and exits non-zero on bad data. */
  build: string;
  files: readonly LiveFile[];
  timeoutMin: number;
  /** CI caches for the build job; `key` is a repo file whose hash keys the cache. At most two. */
  caches?: readonly { paths: readonly string[]; key: string }[];
  /** The build job installs stable Rust first. */
  setupRust?: boolean;
  /** The body-texture slot this dataset feeds; its files are named by `bodyTextureFilename`. */
  bodyTexture?: { bodyId: BodyTextureId; kind: TextureKind };
};
