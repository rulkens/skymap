import type { UserCatalog } from './UserCatalog';

/** UserFileProvenance — the visitor's file as it went into a load, for the trace sidecar. */
export type UserFileProvenance = Pick<UserCatalog, 'fileName' | 'settings'> & {
  readonly nPoints: number;
};
