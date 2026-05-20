import { Source } from '../../data/sources';

/** Pick-encoding-only codes for cluster/supercluster/void markers. */
export type PoiSource =
  | typeof Source.Cluster
  | typeof Source.Supercluster
  | typeof Source.Void;
