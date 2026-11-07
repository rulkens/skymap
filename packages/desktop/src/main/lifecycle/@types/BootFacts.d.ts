import type { DataUpdates } from '../../../@types/DataUpdates';

/** What the first moves of a launch depend on. */
export type BootFacts = {
  firstRun: boolean;
  dev: boolean;
  hasData: boolean;
  dataUpdates: DataUpdates;
};
