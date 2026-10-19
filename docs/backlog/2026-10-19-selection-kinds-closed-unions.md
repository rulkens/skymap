# Selection and source kinds are closed unions in core

**Readiness:** `needs-design`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

Core-owned closed lists: `SELECTION_KINDS` (`data/selection/selectionKinds.ts:7-15`), the `SelectionRef` arms, the `FocusableTarget` union, the 11-arm `SourceEntry` union (`@types/data/SourceEntry.d.ts:23-33`), `TARGET_IDENTITY_KEY`, `URL_HASH_FOR` (`services/url/urlHashFor.ts:23` imports `layers/blackHoles`), `detailCardTable`, and `SettingsAction` (`@types/animation/SettingsAction.d.ts:10-11` imports flow and galaxyCatalog slice types). Totality makes each a compile error, not a silent gap, but the Layer is not self-contained.

## Direction

Derive the kind unions from the composed Layers' `selection` rows (`composeSelectionRows`), and move the per-kind codec and identity key onto the row. `URL_HASH_FOR` goes with the URL-contract item.
