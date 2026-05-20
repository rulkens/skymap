import { Source } from '../../data/sources';

/**
 * Sources that participate in the points pipeline (have `.bin` data).
 * Excludes the POI codes (Cluster, Supercluster, Void), which are
 * pick-encoding-only and have no per-survey metadata.
 */
export type SurveySource = Exclude<
  Source,
  typeof Source.Cluster | typeof Source.Supercluster | typeof Source.Void
>;
