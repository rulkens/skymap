import type { R2Transport } from './R2Transport';

/** One kind of `public/data/` artefact, and how it travels to R2 — see `DATA_FAMILIES`. */
export type DataFamily = {
  readonly label: string;
  /** Parent folder the file must sit in, exactly or as a trailing `/<dir>`; null = any depth. */
  readonly dir: string | null;
  /** Tested against `logicalDataName(basename)`, so hashed and logical names match alike. */
  readonly fileName: RegExp;
  /** 'wrangler' rows are manifest-tracked (hashed by buildDataManifest); 'bulk' rows are self-keyed trees. */
  readonly transport: R2Transport['kind'];
  readonly gzipOnWire: boolean;
};
