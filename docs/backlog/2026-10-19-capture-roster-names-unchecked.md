# Capture-roster names are not checked and a capture-only pass is unpickable

**Readiness:** `ready`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`checkFrameOrder.ts:151` adds a capture line's names to a set used only to exempt them from the "drawn somewhere" rule. A misspelled name in `cosmoPasses` resolves to nothing in `resolvePassNames` and the sky bakes without it. A pass that is listed on a capture line but on no render line passes the check, yet `passSlabOf.ts:16-18` skips capture lines, so `pickProgram.ts` never sees it and it is silently unpickable.

## Direction

Every captured name must be in the contributed set (or belong to an absent Layer, which the composition knows). A pass present only in captures is an error unless it declares `pickTarget` or has no `drawPick`.
