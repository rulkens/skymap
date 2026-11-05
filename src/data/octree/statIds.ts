// Append-only. `starCount` / `recordCount` total real (non-blob) records; `chunkCount` spans every depth.
export const STAT_IDS = [
  'starCount',
  'chunkCount',
  'recordCount',
  'medianAbsMag',
  'magOffset',
  'orientationEstimated',
  'diameterEstimated',
] as const;
