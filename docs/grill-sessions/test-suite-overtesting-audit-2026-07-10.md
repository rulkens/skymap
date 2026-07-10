# Grill Session: Test-suite over-testing audit — 2026-07-10

Source: user request ("extensive look at the tests… we are over-testing… remove useless tests and tests that are preventing us from moving forward quickly"), executed in worktree `test-suite-audit`.

A 19-subagent sweep reviewed all 652 test files (4,143 tests, ~79k lines) and flagged 438 tests (~11%) as over-testing: 38 whole-file deletes + 129 files with named trims. This session resolved how aggressively to cut, which borderline categories survive, and what guardrails prevent regrowth. Baseline before cuts: 4,143 tests / 652 files, green in 20.6 s — so the cost being removed is maintenance friction (tests that break on legitimate changes), not runtime.

Flag categories used throughout: **CONSTANT** (restates a literal constant/registry/config back at itself), **MIRROR** (test recomputes the source formula — tautology), **IMPL** (asserts internal wiring, not observable behavior), **TRIVIAL** (type-system-at-runtime, finite-only smokes, stdlib), **DUPLICATE** (invariant covered elsewhere). Explicit keep-rules protected on-disk formats (galaxyCatalogFormat v6, scalarFieldFormat, structureCatalogFormat, filamentBinaryFormat, selectionEncoding, sources codes), WGSL/TS parity + uniform byte layouts, VizieR-fixture parser tests, and bug-history regressions.

---

## Q1: How aggressive should the cut be?

**The question:** The 38 file deletions are one cheap `git rm` sweep; the 129 trims are per-test surgery inside otherwise-good files — a much larger diff, some cutting just 1 borderline test from a 10-test file. What's in scope?

**Considerations:**
- **Option A (deletes only):** Smallest diff, but leaves the worst friction class (registry-snapshot tests that break on every legit addition) alive inside kept files.
- **Option B (deletes + high-value trims):** Cuts the ≥2-test trims and named friction sources (~15–20 files); leaves 1-test DUPLICATE/MIRROR trims to die naturally when files are next touched. Recommended by Claude as the churn/value sweet spot.
- **Option C (deletes + all 129 trims):** Thorough scrub; biggest diff; needs a guard against cutting a keeper.

**Decision:** Option C — full scrub, with subagents doing the mechanical work ("you can use plenty of subagents for this"). The whole point of the audit was to stop paying maintenance friction; leaving flagged tests in place re-defers the cost.

## Q2: Registry exact-list tests — cut, weaken, or keep?

**The question:** Tests like clipRegistry's "registers the expected clips" (a 21-entry exact list), tourRegistry, desiPatches "ships cone/wedge/sgw", FONT_IDS. Reviewers flagged them CONSTANT. Counter-argument: they're a "did you *mean* to change the shipped set?" checkpoint — an entry dropped in a bad merge would vanish silently.

**Considerations:**
- **Option A (cut exact-list assertions, keep structural checks):** The kept id==key / non-empty-label checks catch real copy-paste bugs; for statically-declared literal registries a dropped entry is plainly visible in `git diff`, so the exact-list test only restates the file.
- **Option B (replace with count lower-bounds):** Only meaningful when a registry is assembled dynamically — none of these are.
- **Option C (keep):** Checkpoint value; but that value is near zero for static literals while the friction (every legit addition breaks the test) is constant.

**Decision:** Option A. Cut every exact-list registry assertion; keep the structural id/label invariant tests in the same files. Rationale: diff review already covers accidental deletion of a static literal.

## Q3: Boundary-value clamp tests

**The question:** clampVolume has 8 "returns <bound> at the exact floor/ceiling boundary" tests alongside kept clamp-from-above/below tests. Boundary tests normally catch `<` vs `<=` flips — do these?

**Considerations:**
- **Option A (cut clamp-boundary, keep classifier-boundary):** For a clamp, `x === bound` returns the bound under *either* operator, so the test is observationally vacuous — it can only fail if the bound constant changes, making it a pure CONSTANT restatement. For threshold *classifiers* (galaxyTypeFromColor ≤-semantics, galaxyTypeFromJminusK) the two operators produce different outputs, so those boundary tests are load-bearing and stay.
- **Option B (keep all as house style):** Uniformity, but preserves vacuous tests.
- **Option C (cut both):** Would delete genuinely operator-distinguishing classifier tests.

**Decision:** Option A. The mechanical rule: a boundary test stays iff the two comparison operators are observationally distinguishable at the boundary.

## Q4: Guardrail against regrowth

**The question:** The 438 flagged tests were written by past sessions following "TDD via plans" — conventions said *write tests* but never *what not to test*. Without a codified rule the next 50 plans regrow the same crud.

**Considerations:**
- **Option A (conventions doc + CLAUDE.md reference, same PR):** `docs/superpowers/conventions/testing.md` codifying anti-patterns (no runtime type tests — tsc owns that; no constant/registry restatements — the diff owns that; no vacuous clamp-boundary tests; no MIRROR recomputation — use hand-computed values) and the keep-rules (formats, parity, fixtures, regressions, operator-distinguishable boundaries). CLAUDE.md's stale "590+ tests across 76 files" line replaced with a pointer to the doc. Rule + first enforcement land together.
- **Option B (separate docs PR):** Decouples review, but the doc is the justification for the cuts — splitting them weakens both.
- **Option C (no doc):** Session memory decays; regrowth guaranteed.

**Decision:** Option A.

## Q5: Verification before cutting

**The question:** 438 cuts rest on single-reviewer judgment; a few trims were self-flagged "low confidence". One misclassified cut = silently lost real coverage. How much adversarial verification before the knife?

**Considerations:**
- **Option A (adversarial verify on all ~167 flagged files):** Skeptic subagent per file tries to REFUTE each cut against the keep-rules; highest safety, ~170 agent runs.
- **Option B (verify only the 38 deletes + self-flagged low-confidence trims):** Deletes are the irreversible-feeling bulk removals and the low-confidence items are the known soft spots; the remaining trims are mostly mechanical CONSTANT/MIRROR cuts where the reviewer cited the specific assertion, and the user reviews the PR diff anyway.
- **Option C (no verification):** Fastest; relies entirely on the green suite + human PR review.

**Decision:** Option B (user revised from Claude's initial A recommendation). Verify the deletes and self-flagged low-confidence trims; trust the rest to the reviewer verdict + PR review. Claude additionally spot-verified two delete files inline (engineHandle.shape — tautological runtime assertion over a test-local array; bindGroupLayouts/fadeUniforms — restates source literals against a mock, never compares to WGSL) and both verdicts held.

## Q6: PR shape and ride-alongs

**The question:** How do the cuts, conventions doc, CLAUDE.md updates, and this transcript land?

**Considerations:**
- **Option A (single PR, logical commits: deletes / trims / docs / transcript; 2 backlog entries):** One reviewable unit, squash-merged per house convention. No separate `docs/audits/` report — transcript + PR description carry the record. Backlog entries for the two out-of-scope findings: famous-curator suite runtime cost (real sharp encodes + tmpdir I/O — execution cost, not over-testing) and the 4×-tested deproject square-in/square-out invariant (consolidation candidate).
- **Option B (split docs into second PR):** More PRs, no benefit — the doc justifies the cuts.
- **Option C (multiple PRs by category):** Review overhead without isolation value; the cuts are one coherent change.

**Decision:** Option A.

## Q7: Sacred zones

**The question:** Any area to leave over-tested regardless of flags — tour/clip system (actively evolving), `tests/visual/` baselines, `tools/catalog` (bugs silently corrupt shipped bins)?

**Considerations:**
- **Option A (no sacred zones):** The keep-rules already retained ~89% of the suite including all format/parity/fixture/regression tests in those areas; remaining flags there are the same constant-restatements as everywhere else (e.g. cosmicFlows timeline-by-index, whose own docstring points at tour.integration for the real coverage). Exemptions would reintroduce by fiat the friction the audit exists to remove.
- **Option B (named exemptions):** Comfort at the cost of coherence; no candidate survived scrutiny.

**Decision:** Option A — every flag stands.

---

## Outcome

- Scope: 38 file deletes + all 129 trim files (~438 tests), per Q1/Q7.
- Category rules: exact-list registry assertions cut (Q2); clamp-boundary cut, classifier-boundary kept (Q3).
- Safety: adversarial verify pass on deletes + low-confidence trims only (Q5).
- Docs: `docs/superpowers/conventions/testing.md` + CLAUDE.md pointer, same PR (Q4); single squash-merged PR with this transcript and 2 backlog entries (Q6).
