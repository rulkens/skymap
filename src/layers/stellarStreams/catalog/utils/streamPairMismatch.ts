/** The bin and the meta are built index-parallel; a count mismatch means one is stale. */
export function streamPairMismatch(binStreamCount: number, metaLength: number): string | null {
  if (binStreamCount === metaLength) return null;
  return (
    `stellar streams length mismatch: stellar-streams.bin has ${binStreamCount} streams but ` +
    `stellar_streams_meta.json has ${metaLength} entries — regenerate via "npm run build-stellar-streams"`
  );
}
