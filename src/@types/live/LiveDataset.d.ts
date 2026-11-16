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
  /** A CI cache for the build job's inputs; `key` is a repo file whose hash keys the cache. */
  cache?: { paths: readonly string[]; key: string };
  /** The build job installs stable Rust and caches cargo's build (Swatinem/rust-cache). */
  setupRust?: boolean;
  /** The body-texture slot this dataset feeds; its files are named by `bodyTextureFilename`. */
  bodyTexture?: { bodyId: BodyTextureId; kind: TextureKind };
};
