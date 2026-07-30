# Grill Session: Refactor CLI (ts-morph toolkit) — 2026-07-21

Source: conversation — user wants refactoring in skymap to be much faster and simpler, building on ts-morph (already a dependency, powering `npm run move-files`) plus a set of additional tools an agent can drive.

Goal: design a small toolkit of mechanical, AST-safe refactoring operations that map one-to-one onto skymap's house conventions (one symbol per file, filename = export name, deep relative imports, no barrels), so large renames/extractions/deletions stop being grep-and-hand-edit slogs.

---

## Q1: Which refactoring operations are in scope?

**The question:** "Refactoring" spans a wide menu and each op is its own tool-worth of work. Which operations are the actual bottleneck worth building for?

**Considerations:**

- **Op 1 (rename symbol repo-wide):** Because of the one-symbol-per-file rule, a symbol rename usually implies a file rename (filename = export name), so it composes with the existing move machinery. The `naming-correctness-paramount` feedback welcomes large renames — highest-frequency op.
- **Op 2 (extract symbol to its own file):** Pull a function/type out of a growing file into `utils/<area>/<fn>.ts` with imports fixed up; driven directly by the one-symbol-per-file convention.
- **Op 3 (inline / delete a symbol):** The `delete-proxy-surfaces` feedback — repoint all call sites, delete the file.
- **Op 4 (find-references / blast-radius report):** Structured "who imports/calls this" instead of grep noise. Arguably overlapping with the harness LSP tool, but LSP doesn't know house rules.
- **Op 5 (change signature):** Reorder/add/remove params across call sites. Much harder, rarely purely mechanical, poor effort/payoff ratio.

**Decision:** Ops **1 + 2 + 3 + 4**. Change-signature (op 5) is out — the agent handles those call-site-by-call-site with `refs` as the worklist.

## Q2: Packaging — one CLI, separate scripts, or an MCP daemon?

**The question:** How are these operations invoked, and does a long-lived server buy meaningful speed?

**Considerations:**

- **Option A (one multi-command CLI):** `npm run refactor -- rename|extract|inline|delete|refs|move`, sharing one Project bootstrap (the three-tree setup `moveFiles.ts` already builds), `--dry` and `--json` on every subcommand.
- **Option B (separate scripts per op):** Like `move-files` today; simplest to add one at a time, but N copies of Project bootstrapping and N npm script names.
- **Option C (MCP server / daemon):** Keeps the Project parsed in memory. Benchmarked on the real repo (2,303 files): Project load ~870 ms, cold find-references ~1,370 ms (type-checker warmup), warm find-refs ~23 ms, repo-wide rename ~26 ms. So a one-shot CLI invocation costs ~2.5–3 s; a warm daemon does subsequent ops in ~25 ms — a real ~100× speedup on repeated ops. But (a) a batch/manifest mode captures most of the win without a daemon (one load, N ops, one save — 20 renames ≈ 3 s total), and (b) a daemon holds a stale AST: every agent `Edit` between MCP calls invalidates its in-memory Project, and refresh-before-op costs approach a full reload — or it silently rewrites against stale code, which is worse than slow.
- **Option D (LSP for reads, CLI for writes):** Least code, but LSP rename doesn't know the file-rename implication or test-mirror drag, and op 4 was explicitly requested.

**Decision:** **A** — one `tools/refactor/` CLI with subcommands, every subcommand batchable via manifest. MCP is a "revisit if it ever feels slow in practice" note, not part of v1.

## Q3: Symbol addressing + rename semantics

**The question:** How does the caller name a target symbol, and what does `rename` imply beyond the identifier?

**Considerations:**

- Addressing by bare symbol name is ambiguous across 2,300 files; addressing by `<file>#<exportedName>` (e.g. `src/utils/math/clamp.ts#clamp`) is unambiguous, tab-completable, and natural under one-symbol-per-file. The CLI errors and lists candidates if the name is ambiguous within the file.
- Per the filename-tracks-symbol convention, renaming an exported symbol whose file is named after it should also rename the file — and drag the test mirror via the existing `expandTestMirrors` — or the repo immediately violates its own convention. An escape hatch (`--no-file-rename`) covers the exceptions.

**Decision:** `<file>#<symbol>` addressing everywhere. `rename` renames the file (+ test mirror) by default when filename = symbol name; `--no-file-rename` opts out.

## Q4: `extract` — what happens to the symbol's private dependencies?

**The question:** `extract <file>#<symbol> <dest.ts>` creates the new file, removes the declaration from the source, repoints external importers, and re-imports into the source file if still used internally. But what about file-local helpers/consts/types the symbol references that aren't exported?

Worked against the real `src/data/superGalacticTransform.ts` (local `buildSgToGal`/`buildGalToEq` → local `R_SG_TO_GAL`/`R_GAL_TO_EQ` → exported `SG_TO_EQ_MATRIX` → three more exports):

**Considerations:**

- **Option A (error out and list local deps):** Zero surprise, but extracting `SG_TO_EQ_MATRIX` (whose four-symbol local dep chain is used by nothing else) would force first extracting intermediate matrices nobody wants as public API. Tedious exactly on the tangled files extraction targets.
- **Option B (drag exclusive deps, error on shared):** A local helper used only by the extracted symbol (transitively) moves with it — the new file is the cohesive unit; a local dep shared with remaining code blocks with a message naming it. The shared-dep error is a design signal: per the asymmetry-trigger feedback, a shared local helper is precisely the "second user = give it its own file" moment.
- **Option C (always proceed — auto-export shared deps):** One-shot always, but silently widens the source module's public API; e.g. a coordinate-transform data module would grow a public generic `crossNormalize` helper — exactly the grab-bag shape one-symbol-per-file forbids.

**Decision:** **B**. Extraction of a previously-unexported symbol necessarily exports it from the new file — inherent, not even warned about.

## Q5: How far does `inline` go?

**The question:** The motivating case is `delete-proxy-surfaces`: a repointed accessor carrying only ergonomics gets deleted, call sites go to the real thing. Is general function inlining in scope?

**Considerations:**

- **Option A (general inlining):** Substitute the body at every call site. Argument-evaluation order, params used twice, captured locals, early returns — IDEs get this wrong regularly; doing it blind across 2,300 files is a correctness hazard.
- **Option B (passthrough-only inline):** Handles exactly the proxy shape — `export const foo = bar`, `export function foo(x) { return bar(x) }` (same params, same order, no extra logic), re-exports. Repoints importers/call sites at the underlying symbol, deletes the wrapper (+ file + test mirror if one-symbol file), errors with the ref list for anything richer.
- **Option C (B + separate `delete`):** `delete <file>#<symbol>` refuses when references exist (listing them) and otherwise removes the symbol/file and fixes importers' dangling import lines. Useful standalone for dead-code sweeps; keeps `inline`'s contract crisp.

**Decision:** **C**. Passthrough inlining covers ~all proxy-surface cases mechanically; general inlining is where the agent should make per-call-site judgment calls, with `refs` as the worklist and `delete` as the final sweep. Two small predictable tools beat one clever risky one.

## Q6: What does `refs` report?

**The question:** "Find-references / blast-radius" spans from a flat location list to a transitive importer closure. What output is actually decision-grade?

**Considerations:**

- **Option A (flat list):** `file:line:col` per reference — what LSP gives; grep-shaped output that forces follow-up reads.
- **Option B (structured, classified):** Each ref tagged with kind (`import`, `call`, `type-position`, `re-export`, `test`) and enclosing declaration (`engine.ts → function frameTick`), grouped by file, with a summary header (N refs, M files, K tests). `--json` for agents, aligned text for humans. Turns "who uses this" into "who depends on this and how".
- **Option C (B + transitive importer closure):** Depth ≥ 2 in a no-barrel repo balloons to half the tree and stops being informative; chaining `refs` calls covers the rare genuine need.

**Decision:** **B**, plus: the mutating subcommands compute the same blast radius internally, so `rename`/`extract`/`inline`/`delete` `--dry` emit the same structured report — `refs` is that reporter exposed standalone.

## Q7: Guardrails on mutating subcommands

**The question:** Clean-git requirement? Built-in typecheck? Or preview + report?

**Considerations:**

- **Option A (require clean git tree):** Safe but hostile — mid-task dirty worktrees are the norm, and the tool is most useful mid-refactor.
- **Option B (built-in post-op typecheck):** Duplicates the `npm run typecheck` gate every task already runs, roughly doubles op latency, and "new vs pre-existing errors" needs a baseline pass that doubles it again. Complects "do the edit" with "judge the edit".
- **Option C (preview + report + git as the net):** `--dry` everywhere, always print the structured blast-radius report, trust version control — a bad rename is one `git checkout` away. Matches `move-files`' existing contract, including commit hygiene (pure mechanical op in its own commit so rename detection survives).

**Decision:** **C**, with one refinement: subcommands fail loudly **before touching anything** on resolution problems (symbol not found, ambiguous name, dest exists), and batch/manifest mode validates all entries first, then applies — all-or-nothing in memory, single save (same shape as `applyMoves` today).

## Q8: What happens to `move-files`?

**The question:** The new CLI needs the same three-tree Project bootstrap `moveFiles.ts` builds, and `move` is morally the fifth subcommand. Coexist, fold, or fold-and-delete?

**Considerations:**

- **Option A (leave untouched, CLI alongside):** Zero churn, but two entry points duplicating the bootstrap and test-mirror expansion; future fixes land twice. The proxy-surface shape the feedback says to kill.
- **Option B (fold: `refactor move` is the implementation, `npm run move-files` stays as alias):** Extract the shared bootstrap into `tools/utils/refactor/`; `moveFiles.ts` shrinks to a thin arg-forwarder. CLAUDE.md, the move-files skill, and many project memories name `move-files` — the alias preserves muscle memory and docs.
- **Option C (fold and delete the alias):** Purest, but breaks every doc/memory reference for no functional gain.

**Decision:** **B**. The bootstrap extraction is the refactor-the-ground prep commit. Skill-side: one new `.claude/skills/refactor/SKILL.md` covering all subcommands (when to reach for each; the string-literal/`.wesl` blind spots, which apply to all ops; the grep-after sweep), and the move-files skill slims to point at it.

## Q9: Build process

**The question:** Full spec + plan pipeline, transcript + plan, or inline build?

**Considerations:**

- **Option A (full pipeline: refactor-ground → spec → plan):** The spec would be a transcription of decisions already made in this session; the ground prep (bootstrap extraction) is already identified.
- **Option B (grill transcript + plan):** This transcript is the design record; a TDD plan in `docs/superpowers/plans/2026-07-21-refactor-cli.md` (plan-style.md, contract code yes / implementation code no) references it, executed via subagent-driven-development in a fresh worktree, draft PR at first task, prep-first commits.
- **Option C (build inline):** Undersized for this behavior surface — `extract`'s dependency analysis alone deserves TDD tasks.

**Decision:** **B**. Plan-writing delegated to a subagent; PR packaging (prep rides the feature PR or not) checkpointed with the user when execution starts.

---

## Post-plan-review addenda (2026-07-21, confirmed with the user)

Three interpretation points surfaced while reviewing the drafted plan; resolved the same day:

### Q10: Does `delete` refuse on re-exports too?

**The question:** The Q5 decision had `delete` both "refuse when references exist" and "fix dangling import lines" — but a re-export IS a reference (`collectRefs` classifies it as one), so a repair branch could never trigger under strict refusal.

**Considerations:** (A) refuse on ANY reference including re-exports — simplest contract, no repair logic; in a no-barrel repo re-exports are near-nonexistent, and the agent hand-removes the rare one then re-runs. (B) treat pure re-export lines as removable plumbing and refuse only on imports/calls/type-positions — more one-shot power, more logic + tests for a case the repo's conventions make vanishingly rare.

**Decision:** **A.** No repair branch; a test pins that a re-export-only reference still refuses.

### Q11: Manifest scope

**The question:** "Every subcommand batchable via manifest" — per-subcommand manifest files, or one mixed-op list?

**Decision:** **Per-subcommand** (an array of that subcommand's arg-tuples; `move` keeps the existing `[{from,to}]` shape). Matches the `moves.json` precedent; mixed sequences = run the CLI twice at ~1 s load each. A mixed-op union schema is not worth defining for that saving.

### Q12: PR packaging

**Decision:** **One PR, prep-first** — the bootstrap-extraction and move fold-in commits ride the feature PR, squash-merged. (Confirms the plan's default; the execution-start checkpoint is resolved.)

Also folded into the plan without a decision needed: `--manifest` value-flag reading gets one shared `readManifest.ts` helper used by both `refactor.ts` and the rewired `moveFiles.ts` (a second copy of the `indexOf('--manifest')` idiom would hit the generalize-repeated-fixes trigger).

## Benchmark record (2026-07-21, M-series laptop, repo @ `a0b9c6d0`-era)

ts-morph 28, Project over `src/ + tests/ + tools/` = 2,303 files:

| op | cost |
| --- | --- |
| Project load | ~870 ms |
| find-references, cold (type-checker warmup) | ~1,370 ms |
| find-references, warm | ~23 ms |
| repo-wide class rename (in-memory) | ~26 ms |

One-shot CLI invocation ≈ 2.5–3 s all-in; batching amortizes the load across N ops.
