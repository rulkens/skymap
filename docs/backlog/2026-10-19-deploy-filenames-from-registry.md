# Derive deploy filenames from the registry; dev hides a miss

**Readiness:** `ready`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`tools/deploy/r2/dataFamilies.ts:20` hard-codes `(sdss|glade|milliquas)-(small|medium|large)|2mrs|famous|desi-(deep|wedge|sgw)`, `:52` the volume names, `:27/:34/:43` the star names. Builders hard-code their own (`buildMcpmVolume.ts:45-47`, `buildDustVolume.ts:39-41`, `buildStars.ts:556`). The runtime composes names from the registry (`tierTargets.ts:79-96`, `cosmicWebDensityFetcher.ts:22`). `dataUrl` falls back to the identity path when the manifest lacks a file (`dataManifest.ts:35-37`), so Vite serves `public/data` in dev and prod 404s; an optional layer "draws nothing" (`cosmicWebDensityFetcher.ts:4`). `dataFamilyOf.test.ts:23-66` is a hand list.

## Direction

One path helper per family (`tierFilenameForSource` is the model) used by builder, fetcher and `DATA_FAMILIES`; a test over every registry row × tier asserting `dataFamilyOf(...) !== null`; the dev fallback logs loudly or is removed.
