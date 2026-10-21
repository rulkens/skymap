/** What the chunk planner budgets against: chunk slots, pool records, and each chunk's run. */
export type OctreePoolCapacity = {
  readonly slots: number;
  readonly records: number;
  /** Records chunk `id`'s run takes (its record count rounded up); `id` must be a learnt ref. */
  runRecords(id: number): number;
};
