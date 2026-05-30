# Famous-galaxy thumbnail calibration — Plan 6: ADR

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record the storage decision — famous calibration lives on the existing `famous_meta.json` entry, not in `famous.bin` — as an Architecture Decision Record.

**Architecture:** Documentation only. Uses the project's `/adr` convention (auto-numbered under `docs/adrs/`).

**Depends on:** the decision is final in the spec; this just records it. Best done last so the ADR can reference the landed shape.

---

## Task 1: Scaffold + write the ADR

**Files:**
- Create: `docs/adrs/000N-famous-calibration-storage.md` (next number — check `docs/adrs/` for the current max; the cluster work landed 0003)

- [ ] **Step 1:** Create the ADR via the `/adr` skill (or copy the template of the most recent ADR, e.g. `docs/adrs/0003-cluster-catalog-loading.md`), titled "Famous-galaxy calibration storage".
- [ ] **Step 2:** Fill the sections:
  - **Context:** curated WebPs need centre/scale/rotation + a deprojected flag per galaxy; the data is famous-only, optional, and variable-shape.
  - **Decision:** store it as an optional `calibration` field on the existing `famous_meta.json` entry (`FamousMetaEntry`).
  - **Alternatives considered:** (a) a new `famous_calibration.json` sidecar — rejected: duplicates the load/route path already in place for `famous_meta.json`; (b) a `famous.bin` v7 format bump — rejected: won't fit the 6 spare bytes, forces a regenerate-all of every tier, and couples famous-only data to the shared fixed-stride catalog format.
  - **Consequences:** zero new load plumbing (meta is already routed to `texturedDiskSubsystem`); fully backward-compatible (absent field → unchanged); famous-meta is now the home for famous-only render hints.
- [ ] **Step 3:** Cross-link the spec (`docs/superpowers/specs/2026-05-31-famous-galaxy-thumbnail-calibration-design.md`).
- [ ] **Step 4: Commit**

```bash
git add docs/adrs/000N-famous-calibration-storage.md
git commit -m "docs(adr): famous calibration stored on famous_meta.json, not the bin

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes

- Spec coverage: the "ADR" section of the spec maps directly to this single task.
- No code; the decision is already implemented across plans 1–4, so this records reality, not intent.
