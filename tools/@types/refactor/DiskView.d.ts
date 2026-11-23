import type { ProjectSnapshot } from '../../../packages/move-files/src/@types/ProjectSnapshot';

/** The repository as it is on disk, before the run's overlay; injected so folds are testable. */
export type DiskView = {
  readonly read: (file: string) => string;
  /** Every file that can hold a reference; costly, so asked for only when a plan moves a file. */
  readonly snapshot: () => Pick<ProjectSnapshot, 'texts' | 'fileExists'>;
};
