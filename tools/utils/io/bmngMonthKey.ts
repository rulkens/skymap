import type { RawDataKey } from './rawDataRegistry';

type BmngMonthKey = Extract<RawDataKey, `textures.nasaBmngMonth${string}`>;

/** Registry key of the 21600x10800 equirect for a calendar month (1 = January). */
export function bmngMonthKey(month: number): BmngMonthKey {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`bmngMonthKey: month must be 1..12, got ${month}`);
  }
  return `textures.nasaBmngMonth${String(month).padStart(2, '0')}` as BmngMonthKey;
}
