/** One pgc shard's entries, ascending by pgc (`PGC_SHARD_SCHEMA`). */
export type PgcShard = {
  readonly objId: BigUint64Array;
  /** The record's catalog-global ordinal. */
  readonly ordinal: Float32Array;
};
