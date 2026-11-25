import type { CatalogFiles } from '../import/CatalogFiles';
import type { CatalogImportSettings } from '../import/CatalogImportSettings';
import type { CatalogPreview } from '../import/CatalogPreview';
import type { CatalogRead } from '../import/CatalogRead';

/**
 * CatalogWorkerClient — the load dialog's handle on the catalog worker. Every
 * promise resolves null once a newer request has superseded it.
 */
export type CatalogWorkerClient = {
  /** Reads the files into the worker; `held` once it can derive from them. */
  readonly read: (files: CatalogFiles) => Promise<CatalogRead | null>;
  /** The held files under these settings; the arrays arrive transferred, not copied. */
  readonly derive: (
    settings: CatalogImportSettings,
    autoFitPercent: number,
  ) => Promise<CatalogPreview | null>;
  /** Forgets the held files, so the worker keeps no copy. */
  readonly drop: () => void;
  readonly dispose: () => void;
};
