/**
 * DataManifest — logical data path → the hashed path the build wrote.
 *
 * Produced by `tools/deploy/buildDataManifest.ts`, fetched once at boot
 * (Task 12) and by tool-side reads (Task 13). Keys and values are both
 * posix-relative paths below `public/data/`, e.g.
 * `'galaxy-catalog/v9/2mrs.bin'` → `'galaxy-catalog/v9/2mrs.a3f19c2e.bin'`.
 */

export type DataManifest = Readonly<Record<string, string>>;
