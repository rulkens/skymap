import type { SourceType } from '../data/SourceType';

/**
 * DataStatusState — the serializable readiness descriptor. catalogGen bumps per
 * catalog commit (the AssetSlot generation, projected via catalogLoaded);
 * structureGen bumps when the structure store changes. The reconciler saga
 * takes catalogLoaded to re-resolve still-null rows; React never reads this.
 */
export type DataStatusState = {
  readonly catalogGen: Partial<Record<SourceType, number>>;
  readonly structureGen: number;
};
