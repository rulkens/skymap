# Rhizome quick-look vs the v9 epoch/manifest data layout

**Status:** ready · **Area:** tools/volumes · **Origin:** #545 (format v9) landed
immediately after #546 (rhizome importer) and moved the scfd outputs out from
under the quick-look loop.

## The break

#546's `--quick-look` targets the pre-v9 path; #545 moved the real reference:

- `buildRhizomeVolume.ts` composes the quick-look target as
  `public/data/mcpm-large.scfd` (CLI, ~`:209`) and `isQuickLookOutput()` (~`:44`)
  compares against the same root path.
- Since #545, `buildMcpmTier` writes
  `public/data/${SCALAR_FIELD_DATA_PREFIX}/mcpm-large.scfd`
  (`scalar-field/v3/`), a manifest post-pass content-hashes it
  (`mcpm-large.<hash>.scfd`) and records it in `public/data/manifest.json`, and
  `mcpmFetcher` + `dataManifest.ts` resolve the logical name through that
  manifest.

Net effect: `--quick-look` writes to a dead v8-root path the viewer never
fetches — it can no longer put a cube on screen. The sentinel loop is still
internally consistent (writer / deleter `buildMcpmVolume.ts:156` / syncR2 guard
`:120` all use `quickLookSentinelPath('public/data')`) and `sync-r2` still
refuses while the sentinel exists, so nothing unsafe ships — the feature is
stranded, not dangerous.

## The design question

Overwrite-in-place no longer exists under content-hashed immutable filenames.
Options, roughly in order of appeal:

1. **Write epoch-prefixed + re-run the manifest post-pass** — quick-look writes
   `scalar-field/v3/mcpm-large.scfd` then invokes the same hashing/manifest step
   `build-mcpm` uses; the cube gets its own hash and the manifest points at it.
   Restore = `npm run build-mcpm` (which already re-runs the post-pass).
   Sentinel semantics carry over with the sentinel relocated next to the epoch
   file.
2. **Dev-only manifest bypass** — a fetcher fallback to the unhashed logical
   name when the manifest lacks/flags an entry. Touches `src/`; #546's global
   constraint ("no runtime/src changes") suggests keeping the fix tools-side.
3. Fold quick-look into the rhizome-shells plan, which will face the same
   epoch-layout questions for its own `rhizome-*.scfd` outputs anyway.

Whichever route: `isQuickLookOutput`, the CLI target, and the sentinel location
must move together — they share `quickLookSentinelPath`/`MCPM_TIER_FILENAME`
precisely so they cannot drift; keep it that way.

## Non-urgency

Quick-look's consumer is the PolyPhy fork's calibration cube, itself blocked on
rulkens/PolyPhy#114. Align before (or as part of) the rhizome-shells plan.
