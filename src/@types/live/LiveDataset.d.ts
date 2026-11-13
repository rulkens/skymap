import type { BodyTextureId } from '../data/BodyTextureId';
import type { TextureKind } from '../data/TextureKind';
import type { LiveFile } from './LiveFile';

/**
 * One nightly-built dataset. `caches` and `bodyTexture` are read only by the clouds leg
 * (phase C); no satellites row sets them.
 */
export type LiveDataset = {
  /** R2 folder name. */
  id: string;
  /** npm script that writes the live layout under public/data and exits non-zero on bad data. */
  build: string;
  files: readonly LiveFile[];
  timeoutMin: number;
  caches?: readonly { paths: readonly string[]; key: string }[];
  bodyTexture?: {
    bodyId: BodyTextureId;
    kind: TextureKind;
    fileByTierPx: Readonly<Record<number, string>>;
  };
};
