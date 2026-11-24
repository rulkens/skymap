import type { Project } from 'ts-morph';
import type { Finding } from '../../@types/refactor/Finding';
import type { Plan } from '../../@types/refactor/Plan';

/** What the driver lends one op: the lazy ts-morph project, the fold, and the run's findings. */
export type OpContext = {
  readonly project: () => Promise<Project>;
  readonly apply: (plan: Plan) => void;
  readonly findings: Finding[];
  readonly batch: boolean;
  readonly texts: () => ReadonlyMap<string, string>; // every project file's text, overlay applied
};
