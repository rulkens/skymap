/**
 * volumeSlice — density-volume defaults + a single-key reducer.
 *
 * Defaults match the spike's raymarch tuning. `setVolumeParam` updates one
 * named key immutably; the `keyof VolumeSlice` key type keeps callers honest at
 * compile time.
 */
import type { VolumeSlice } from '../../../@types/state/slices/VolumeSlice';

export const defaultVolumeSlice: VolumeSlice = { intensity: 10, dMax: 1.2, alpha: 16 };

export function setVolumeParam(prev: VolumeSlice, key: keyof VolumeSlice, value: number): VolumeSlice {
  return { ...prev, [key]: value };
}
