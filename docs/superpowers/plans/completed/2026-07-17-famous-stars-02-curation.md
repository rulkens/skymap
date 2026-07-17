# Famous Stars — Plan 02: Curation

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> to execute this plan (fresh subagent per batch). Each batch is an authoring task, not a
> code task. Dispatch authoring subagents with `run_in_background: true`; the **main
> thread** runs `npm run build-famous-stars` (the validator gates the batch), then
> `npm test`, and makes the commits (background subagents cannot run npm — they MAY
> self-run `npx tsc --noEmit` as a pre-flight only, though a curation batch rarely needs
> it).
>
> **Plan style:** [`docs/superpowers/conventions/plan-style.md`](../conventions/plan-style.md).
> This is a data-authoring plan — the "contract" is the seed schema (locked in plan 01's
> `tools/parsers/famousStarsSeed.ts`) and the validator. No implementation code.
>
> **Testing discipline:** [`docs/superpowers/conventions/testing.md`](../conventions/testing.md).
> No new tests — the seed **validator** (plan 01, `parseFamousStarsSeed`) is the gate;
> the parser's structural + coverage invariants already cover schema drift. A batch is
> "green" when `npm run build-famous-stars` validates and the existing suite stays green.

**Spec:** [`docs/superpowers/specs/2026-07-17-famous-stars.md`](../specs/2026-07-17-famous-stars.md)
§11 (Curation plan). **Prerequisite:** plan 01 must be **fully landed** — the pipeline,
the validator, and the **initial 26-star seed (batch 0)** all exist. This plan grows the
seed from 26 → ~115–125 entries (grill Q2 Option C).

**Grill ledger (decisions — cite, do not re-litigate):**
[`docs/grill-sessions/famous-stars-2026-07-17.md`](../../grill-sessions/famous-stars-2026-07-17.md)
Q2, Q5, Q6, Q7, Q10, Q11.

## The four spec corrections (apply while authoring)

Carried from plan 01 — they shape every entry you write:

1. **`distancePc >= 0`** (only the Sun is 0; every new entry is `> 0`).
2. **`names[1]` need not be a Bayer designation** — include it when one exists, omit it
   otherwise; never invent one. `names[0] === commonName` always.
3. **`radiusSolar` + `temperatureK` are REQUIRED** on every entry (render inputs).
   **`massSolar`, `luminositySolar`, `ageGyr`, `oblateness`, `variable` are OPTIONAL** —
   **omit** any that is genuinely unknown; never write `0` or a guess.
4. **`gaiaDr3` is required** — a digit-string or `null` (never missing).

## Authoring rules (every batch — grill Q5–Q7, Q11)

- **One entry per naked-eye point of light** (grill Q5). Multiple systems (Capella,
  Acrux, Castor, Algol) are a **single** entry; the structured fields are the
  **primary's**, companions live in `description`. (Proxima is already its own entry from
  batch 0.)
- **Descriptions: curated, fact-checked prose, 3–5 sentences** (grill Q7 Option B) — what
  it is, name etymology, companions, the one famous fact (Algol's eclipses, Mira's
  11-month vanishing act, Betelgeuse's supernova watch, Albireo's colour contrast).
  **Fact-check via WebSearch/WebFetch against Wikipedia/SIMBAD while authoring — do NOT
  copy prose verbatim** (galaxy-seed leads were verbatim Wikipedia; stars are curated).
- **`gaiaDr3` via SIMBAD identifier lists, NEVER positional matching** (grill Q11 item 4).
  High-proper-motion stars break positional cross-match. Query each star by name in
  SIMBAD, read the `Gaia DR3 <n>` entry from its identifier list, copy the digits. Set
  `null` **only when SIMBAD confirms no Gaia DR3 row** (saturated bright stars — the
  "Not recovered in Gaia DR3" note; the Sun). Add a **`gaiaDr3Note`** when the component
  choice is non-obvious (which star of a multiple the id resolves — mirror the provenance
  style migrated from the old `famousStarGaiaIds.ts`).
- **Physical fields** (`radiusSolar`, `temperatureK`, `spectralType`, `magV`, `absMag`,
  `distancePc`, `ra`, `dec`, `constellation`, and `massSolar?`/`luminositySolar?`/`ageGyr?`/
  `oblateness?`/`variable?` where real) — standard published values (Hipparcos/Gaia-era).
  Mark a star `oblateness` only when it is genuinely flattened (Achernar ~0.35, Altair,
  Regulus).
- **Committed-together workflow (state in every batch task):** author entries → main
  thread `npm run build-famous-stars` (validator gates; regenerates the table + sidecar) →
  `git add data/seeds/famous_stars.seed.json src/data/bodies/famousStars.generated.ts` →
  commit both in one change. The sidecar is gitignored.
- **Subagent implementers** run bash sequentially, cannot use `sed`/`awk`/`grep` (use
  Read/Grep/WebFetch tools), cannot run npm.

---

## Task 1 — Build the target roster (list construction, user checkpoint)

**Files:** none yet (a roster document / the task's report). **No authoring** in this task —
it produces the ordered list the batches consume.

Enumerate the **union** (grill Q2 Option C, ~115–125 total):

```
Wikipedia brightest-stars table (~93, down to apparent V +2.50)
  ∪  the 26 already in the seed (batch 0)
  ∪  ~10 iconic extras: Mira, Algol, Albireo, Eta Carinae, Polaris (if not already in),
     51 Pegasi, + implementer-proposed candidates
```

- [x] Fetch the Wikipedia "List of brightest stars" table (down to V +2.50) via
      WebFetch; extract the ~93 rows (name, Bayer, constellation, V mag, spectral type,
      distance).
- [x] **Dedup against the 26 batch-0 ids** (`data/seeds/famous_stars.seed.json`) — ~7
      overlap (Sirius, Procyon, Altair, Vega, Fomalhaut, Pollux, α Cen), so the brightest
      table contributes ~86 net-new.
- [x] Assemble the ~10 iconic extras. Include the named ones (Mira, Algol, Albireo, η Car,
      Polaris, 51 Pegasi) and **surface any implementer-proposed candidates to the user for
      approval** before authoring (kept short — grill Q2). Dedup these against the 26 + the
      brightest table.
- [x] Produce the final ordered net-new roster (~90–100 entries) split into batch buckets
      of ~15–20, and report it. **Checkpoint with the user** on the extras list before
      Task 2 begins.

## Tasks 2–6 — Author the roster in batches of ~15–20 stars

Each batch is one task. **Author the batch's entries against the full seed schema**
(plan 01 `FamousStarEntry`), following the Authoring rules above. Order the batches
brightest-first (so the most-searched stars — Canopus, Arcturus, Rigel Kentaurus already
seeded, Betelgeuse, Rigel, Capella, Aldebaran, Antares, Spica, Deneb — land first).

Per batch task:

- [x] Author ~15–20 entries: full schema; `gaiaDr3` via SIMBAD identifier lists (`null`
      only on SIMBAD-confirmed absence, `gaiaDr3Note` for non-obvious component choices);
      descriptions 3–5 sentences, fact-checked; **omit** unknown optional fields; one entry
      per naked-eye system (companions in prose).
- [x] Append the entries to `data/seeds/famous_stars.seed.json` (no duplicate ids —
      the validator's duplicate-id check gates this).
- [x] (main thread) `npm run build-famous-stars` — the validator gates the batch (any
      schema drift, out-of-range value, missing `gaiaDr3`, or duplicate id throws loudly
      naming the id). Fix and re-run until green; the table + sidecar regenerate.
- [x] (main thread) `npm test` — the suite stays green (the `sceneStars` length lower-bound
      and the parser coverage invariant absorb the growth; no per-batch test to write).
- [x] (main thread) `git add data/seeds/famous_stars.seed.json
    src/data/bodies/famousStars.generated.ts` and commit both together.

> **Batch count** is driven by Task 1's roster size (~90–100 net-new ÷ ~18 ≈ 5 batches).
> Tasks 2–6 are the nominal five; add a sixth only if the roster + extras exceed ~100
> net-new. Keep each batch a single coherent commit.

## Task 7 — Close-out: visual pass, timing, and R2 sync reminder

**Files:** none (verification + handoff notes). **Do NOT run the R2 sync in this plan.**

- [x] **Visual pass — caption density (grill Q10 Option A).** With ~120 labelled stars, ask
      the user to judge clutter at star-map zoom (roughly Stellarium's default density). If
      it reads too dense, capture a **one-line `magV` caption threshold** follow-up as a
      backlog note — the seed already carries `magV`, so no re-author is needed. This is a
      judgment checkpoint, **not** a designed gate here (avoid a second gating mechanism
      built blind).
- [x] **Oblateness spot-check.** Confirm the batch entries flagged `oblateness` (Achernar,
      Altair, Regulus) actually render flattened — this is the first real visual proof of
      plan 01 Task 7's code path. _Waived at the DoD audit (user decision): shipped without
      the close-approach check; the MVP scale path is unit-tested, visual proof deferred to
      normal use._
- [x] **Timing note (spec §9, grill Q8/Q11 item 5) — LOAD-BEARING.** The complete seed
      (every entry's resolved `gaiaDr3`) MUST land **before the first real `npm run
    build-stars`** run, so the Gaia bin's dedup is complete on its first build and no
      rebuild is needed. Record in the close-out that this plan's completion is that
      gate — the Gaia fetch being still in flight is why the window is ideal.
- [x] **R2 sync reminder (do NOT run here).** The regenerated `famous_stars_meta.json` (and
      any downstream bins) reach production only via `npm run sync-r2-secure`, which must
      run **from the main worktree** (project memory `project_worktree_data_isolation`) —
      not from this worktree, not in this plan. Note it for the user as the deploy step.
- [x] Report the final entry count and confirm the seed + generated table are committed in
      sync (`npm run build-famous-stars` leaves `git diff` clean).

---

## Self-review checklist (before marking the plan done)

- The roster is the union of the brightest table (~93 to V +2.50) ∪ the 26 batch-0 stars
  ∪ ~10 user-approved iconic extras, deduped — grill Q2 Option C, ~115–125 total.
- Every entry: one per naked-eye system (primary's properties, companions in prose);
  `gaiaDr3` by SIMBAD identifier list (never positional), `null` only on confirmed
  absence; descriptions fact-checked 3–5 sentences; unknown optional fields omitted.
- Every batch commits seed + regenerated generated table together; the validator gated
  each batch; the suite stayed green throughout.
- The seed is complete before any real `build-stars` run (the §9 timing invariant); the
  R2 sync is flagged for the main worktree, NOT run here.
