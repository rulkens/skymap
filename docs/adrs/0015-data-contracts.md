# ADR 0015 — One Format Table, a Provenance Manifest, and Versioned Share Contracts

- **Status:** Proposed
- **Date:** 2026-10-19
- **Decision-makers:** Alexander Rulkens (with Claude)
- **Tags:** data, formats, deploy, url, settings, versioning
- **Supersedes:** —
- **Superseded by:** —
- **Related:** `docs/DATA.md` · `docs/DEPLOY.md` ·
  audit `docs/audits/2026-10-16-architecture-weak-points.md` (patterns B and G) ·
  backlog `docs/backlog/2026-10-19-format-table-single-source.md`,
  `docs/backlog/2026-10-19-manifest-provenance-and-prune.md`,
  `docs/backlog/2026-10-19-url-contract-versioning.md`

## Context

Ten binary families exist (SKMP, SKST, SKOI/SKOC, CCAT, SCFD, FILA, SHEL,
SKMH, SCTK, SHGT), each with its own header, version constant and folder
rule, written one at a time since 2026-05-03. Only SKMP throws the typed
`FormatVersionError` that `retryPolicy.ts` and `installFormatVersionAlert.ts`
recognise; the other nine throw a plain `Error`, are retried twice and leave
a blank layer. The octree folder is a hand-typed `v2` beside an
`OCTREE_VERSION` of 1; meshes and tracks have no epoch folder; the tracks
version is a duplicated literal.

The data manifest is a flat logical-to-hashed map with no generation,
commit, input hashes or format versions. Old epoch folders keep being
uploaded; `rclone copy` never deletes; the SDSS input is picked by mtime.

The URL hash carries six keys with three focus codecs and no version or alias
table; a renamed exhibit id sends an old link home. Settings do not persist
yet, which is the moment to decide their migration path rather than after.

## Decision

**Every persisted or shared byte has one declared version in one table, one
typed stale-version path, and a provenance record.**

1. **Format table.** `src/data/formats/formatTable.ts` lists every family:
   magic, `VERSION`, the epoch prefix derived from it, the decoder, and the
   tier scheme. DATA.md's table, `DATA_FAMILIES`, `allowDataFile` and the
   round-trip tests read it. No folder name is hand-typed.
2. **One stale path.** Every decoder calls `assertFormatVersion(table, buf)`
   and throws `FormatVersionError`; the retry policy and the alert already
   handle it. A new family that forgets gets a failing table test.
3. **Manifest v2.** `{ generation, commit, builtAt, entries: { logical: { hash,
   family, version, inputs: sha256[] } } }`. A build records the raw-registry
   keys and hashes it read. Sync restricts each family to its current epoch
   folder and prunes against the last N manifests. A client that sees a
   mixed generation reports it.
4. **Versioned share contracts.** The hash carries `v=`; absent means v1.
   An id-alias table maps renamed exhibit, tour, clip and famous ids. Unknown
   keys survive a rewrite. Settings persistence, when it lands, carries the
   same `v` and a migration list from day one.

## Alternatives considered

**Per-family fixes as they bite.** This is what produced ten shapes.

**One container format for everything.** Larger than needed; the families
differ in record shape for good reasons. The table is the cheaper unification.

## Consequences

- Positive: a stale client shows one alert for any family; a deployed bin can
  be traced to its inputs and commit; old links keep working across renames.
- Negative: a one-time sweep over ten decoders and the manifest writer and
  readers; the hash gains one key.
