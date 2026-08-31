/** Human-scale byte readout (KB/MB/GB) — shared by Hud's budget badge and
 * GridBoxPanel's live memory-cost estimate, so the two never disagree on
 * rounding/units for the same underlying number. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
