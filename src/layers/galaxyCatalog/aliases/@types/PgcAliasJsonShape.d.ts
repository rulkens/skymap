/**
 * The JSON-on-disk shape: `{ "<pgc>": ["NGC 4565", "UGC 7772", …], … }`.
 * Public to support unit tests against `parsePgcAliases` without
 * spinning up `fetch`.
 */
export type PgcAliasJsonShape = Record<string, string[]>;
