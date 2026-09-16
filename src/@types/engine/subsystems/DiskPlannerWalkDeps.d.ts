/** Construction options for `createDiskPlannerWalk`. */
export type DiskPlannerWalkDeps = {
  /** Defaults to 8. Tests pass 1 to disable decimation. */
  readonly decimationFactor?: number;
};
