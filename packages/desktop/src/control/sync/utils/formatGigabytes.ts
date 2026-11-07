export function formatGigabytes(bytes: number): string {
  return `${(bytes / 1e9).toFixed(1)} GB`;
}
