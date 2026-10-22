/** What the chunk planner budgets against: chunk slots, pool records and rows, and each chunk's runs. */
export type OctreePoolCapacity = {
  readonly slots: number;
  readonly records: number;
  readonly nodes: number;
  /** Records chunk `id`'s run takes (its record count rounded up); `id` must be a learnt ref. */
  runRecords(id: number): number;
  /** Rows chunk `id`'s node run takes, likewise. */
  runNodes(id: number): number;
};
