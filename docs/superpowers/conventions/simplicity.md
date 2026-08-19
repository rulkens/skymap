# Simplicity — _Simple Made Easy_, applied to skymap

> **Audience.** Anyone organizing, writing, or refactoring skymap code. This is
> the lens we use to decide whether a design is _good_ — separately from whether
> it is _familiar_ or _quick to type_. It distils Rich Hickey's "Simple Made
> Easy" (Strange Loop 2011) into skymap-specific guidance.
>
> **Status.** Principles doc — advisory, but the Do/Don't lines are the
> prescriptions. It is honest about the gap: much of the codebase predates these
> ideas, and plenty of it is still complected. The "Known entanglements" section
> is a _worked example of the radar_, not a clean bill of health — run the
> `entanglement-radar` skill to grow the backlog.

## TL;DR

**Simple is the absence of braiding; easy is nearness.** They are different axes,
and we optimise for _simple_.

- **Simple** = _one fold_ — one role, one concept, not interleaved with anything
  else. It is an **objective** property: you can look and see whether two things
  are twisted together.
- **Easy** = _near to hand_ — installed, familiar, within your current reach. It
  is **relative**: easy _for whom?_

What we live with is not the code we type (the _construct_) but the running,
changing system (the _artifact_). Simplicity is a property of the artifact, so we
judge a construct by the artifact it yields — never by how few characters it took
to type. Every time two things that could vary independently get **complected**
(braided together), the cost of understanding and changing the system grows
combinatorially. The whole job is to keep strands separate: **compose** (place
together) rather than **complect** (braid together).

> Simplicity is a choice, and it requires constant vigilance. Tests and types are
> guardrails — safety nets, not simplicity. A guardrail never points your car
> anywhere; it only stops one crash. They don't touch the core problem.

## The words we use precisely

| Word          | Means                               | Opposite                  | Note                                                           |
| ------------- | ----------------------------------- | ------------------------- | -------------------------------------------------------------- |
| **Simple**    | one braid; un-interleaved           | complex (folded together) | objective; _not_ "few", _not_ "familiar"                       |
| **Easy**      | near, at-hand, familiar             | hard                      | relative to you                                                |
| **Complect**  | braid / entwine together            | compose (place together)  | the verb for what makes software bad                           |
| **Construct** | what we type (language, lib, class) | —                         | judged by authoring ergonomics                                 |
| **Artifact**  | what runs and gets changed          | —                         | judged by reliability + changeability — _this is what matters_ |

Two more, from the talk:

- **Incidental complexity** — complexity your _tool_ introduced, not the problem.
  "Incidental is Latin for _your fault_."
- **Inherent complexity** — complexity in the problem itself; plus _environmental_
  complexity (contention for memory / CPU / GPU budget). "Not your fault" — but
  still yours to manage.

**Simple ≠ few.** Pulling a knot apart usually yields _more_ things, each hanging
straight down. That is the win — more strands you can change independently beats
fewer strands tied in a knot. Don't count things; look for interleaving.

## Principles

Each principle names the complecting it fights and the skymap shape that avoids it.

### 1. Judge the artifact, not the keystrokes

The user never sees our source; they run the system, change it, and rely on it.
"I only had to type 16 characters" is a fact about the construct. "I can reason
about what this does and change it safely" is a fact about the artifact. When a
construct is terser but yields an artifact you can't evolve, it lost.

- **Skymap:** the `.bin` catalog format (`src/data/galaxyCatalogFormat.ts`) is the
  artifact. It stores `magic + version + count` so an old file _fails loudly_ with
  a regenerate message instead of silently mis-decoding. That property is worth far
  more than a cleverer encoder.
- **Do:** ask "what does this yield at runtime, and how hard is it to change?"
- **Don't:** defend a construct on authoring convenience or familiarity alone.

### 2. Complecting is the cost — build entanglement radar

We can hold only a few things in mind at once. Each braid drags another thing into
mind along with the first, so comprehension cost is combinatorial in the number of
interleavings. The skill to develop is _seeing_ the braiding — "not that I dislike
the names or the shape of the code, but these two things could be independent and
they aren't."

- **Do:** for any two things in a change, ask _could these vary independently?_ If
  yes, they should not be braided.
- **Don't:** accept "it's modular / it's in separate files" as evidence of
  simplicity (see #9).

### 3. Prefer more, smaller, separate things

Small interfaces, one concept per unit. Big interfaces are hard to break apart and
hard to re-implement; they are usually a sign that several jobs got jammed together.

- **Skymap:** one type per file in `src/@types`; single-function utility files named
  for their function; no barrel re-exports (so every import is a visible strand).
  `SURVEY_SOURCES` in `sources.ts` is _listed explicitly_, not `Object.values(Source)`
  — so a new enum member can't silently braid itself into the UI and the visibility
  bitmask.
- **Do:** split by concept; keep public surfaces minimal; take dependencies as
  arguments, not hardwired.
- **Don't:** grow a god-interface because union types are inconvenient.

### 4. Data is simple — leave information as data

There are only a few essential shapes of data: maps, sets, sequences. Wrapping
information in a class or method _ruins_ it — it ties your logic to a representation
and destroys your ability to write generic manipulation once and reuse it. "The only
thing you can do with information is ruin it."

- **Skymap:** `SOURCE_REGISTRY` (`src/data/sources.ts`) is _plain data_, discriminated
  by a `type` tag, `as const satisfies Readonly<Record<…>>`. The catalog decodes to
  typed records. We use `type` aliases, never `interface`.
- **Do:** represent a new fact as data in a registry/record. Reach for maps/sets/arrays.
- **Don't:** write a class because you have a new piece of information.

### 5. State is never simple — default to values, concentrate the shell

State complects **value** and **time**: "every time you ask it the same question you
get a different answer." That complexity is poison — it leaks out of any method that
wraps it, because the wrapper is now stateful too. You can only contain it behind a
_true functional interface_ (same input → same output). This is not about concurrency;
it's about whether you can reason about a single-threaded run at all.

- **Skymap:** prefer `readonly` types, pure functions, copy-on-write. The engine
  _can't_ be immutable (GPU handles, per-frame reads, async arrivals) — so the goal
  (ADR 0005) is a **thin mutable shell**: pure constructors that return and never
  install, with a single install step. Hot-path mutation is a deliberate, localised
  carve-out, not the default.
- **Do:** make values the default; isolate mutation to the smallest possible shell;
  expose same-in/same-out interfaces over it.
- **Don't:** let a value be reachable only through a mutable place. A "mirror copy" of
  state that already has an authoritative home is exactly this (a renderer must not
  cache what `EngineState` owns — `renderers.md`).
- **Companion:** [`intent.md`](intent.md) is the state-shaped extension of this
  principle — _where_ a value lives (Intent vs. derived vs. resource) and _who_ may
  write it (a single dispatched write path), so a mirror can't form in the first place.

### 6. Pull _what_ from _how_ — and who / when / where / why

Abstraction means _drawing away_, not _hiding_. A good design answers the six
questions separately. The motto is **"I don't know; I don't want to know."**

- **what** — a small _set of function specifications_ (interface / protocol), defined
  only in terms of values and other abstractions. Keep it small. Don't let the spec
  dictate _how_ (the way `fold` smuggles in left-to-right order).
- **how** — implementation islands, connected by polymorphism, kept apart from
  everything else.
- **who** — entities / data; inject subcomponents as arguments rather than hardwiring.
- **when / where** — _avoid direct A-calls-B coupling_; it forces A to know where B is
  and when it runs. **Stick a queue in there.**
- **why** — policy and rules; gather them in one place instead of strewing conditionals
  through the program.

- **Skymap:** the renderer convention (`renderers.md`) is exactly this — the public type
  is _what_, the closure is _how_, GPU resources are injected. `galaxyImageQueue`
  decouples the _when/where_ of thumbnail fetches from their consumers. The settings
  table (`settingsTable.ts`) is the single write-path between _why_ (a settings leaf)
  and _how_ (a renderer setter).

### 7. Conditionals and switches complect — prefer registries and à-la-carte polymorphism

A `switch` / `if`-chain over a discriminant braids many "who does what" pairs into one
closed place. A registry or a discriminated union pulls them apart and makes the set
_open_ and _exhaustively checked_.

- **Skymap:** `SOURCE_REGISTRY` replaced per-source `if (source === X)` chains — the
  _second_ hardcoded per-source branch is the signal to consolidate, not to add a third.
  `PickResult` (`selectionEncoding.ts`) is a discriminated union, so every call site must
  `switch` on `kind`; adding a POI category surfaces every site at compile time instead of
  hiding behind a magic source-code number.
- **Do:** when you reach for a second branch on the same discriminant, move the data into
  a registry or push behaviour onto a union / protocol.
- **Don't:** keep extending a closed switch.

**The N-way form — tag + table lookup.** For any **more-than-two-way** split on "what kind of
thing is this," give the union a literal **discriminant field** (`type` / `kind`, ideally
mirroring an existing domain tag — in skymap the `SOURCE_REGISTRY` `type`) and **dispatch by
table**: `TABLE[x.type]` where `TABLE: Record<Tag, Behavior | Component | Fn>` (kind → InfoCard
component, kind → URL resolver, kind → commit fn). A new variant is then a new **row**, not an
edit to every dispatch site.

- **The trigger to catch (load-bearing):** the moment a **two-way predicate has to become
  three-way** — `isStructure(t) ? structure : galaxy` now also needs `milkyWay` — do **not** add
  a third predicate (`isMilkyWay`) or a `as T` cast in the false-branch. That `as T` cast
  _suppresses the type error_, so the new variant flows silently into the wrong branch (the
  latent-bug trap). Stop and convert the union to a **tagged union**, then make the dispatch a
  table. (The 2026-06-15 Milky-Way-as-a-source redesign is the worked example: `FocusableTarget`
  gained a `type` tag so the InfoCard/URL/focus dispatches became table lookups.)
- **Do:** tag the union; narrow on `x.type === '…'` (type-safe) for simple guards; use a
  `Record<Tag, …>` table for genuine N-way dispatch.
- **Don't:** sniff structure (`'field' in x`), chain `isA(x) ? … : isB(x) ? …`, or cast in a
  predicate's false-branch.
- **Don't (the table-exists-but-not-used trap):** once a `Record<Tag, …>` table exists, never
  index it by **enumerated hardcoded keys** (`TABLE.galaxyCatalog.X`, `TABLE.structure.X`,
  `TABLE.milkyWay.X` listed separately) or wrap it in **per-type `return` blocks** (one render
  block per kind). If you're listing the keys, you've re-grown the chain — collapse to
  `TABLE[x.type].X` and compute the target type-agnostically. (The 2026-06-16 InfoCard pass:
  three per-type `return` blocks each calling a hardcoded `DETAIL_CARD.<kind>` collapsed to one
  block dispatching `DETAIL_CARD[target.type]`.)

- **Two false triggers that fool you back into a chain (the 2026-06-16 Part-2 sweep):**
  1. **"It's inline, not a standalone table file."** The signal is the _discriminant branch_,
     not whether you're extracting a module. An `if (x.type === …)` chain inside an existing
     function body (a resolver, a `.map`, an equality fn) is the same smell as one in its own
     file. (`resolvePick`, `targetEq`, and the CommandPalette `.map` all stayed chains because
     the dispatch was embedded, while the three sibling dispatches that happened to live in
     `*Table.ts` files came out as tables.)
  2. **"The arms return different shapes, so a table would need casts."** False — the
     row-self-narrows pattern `(x) => x.type === 'k' ? f(x) : fallback` keeps the table's value
     type uniform (`Resolver`, `(x) => string`, `(props) => ReactNode`) while each row computes
     something arm-specific. Output divergence is _never_ a reason to drop to a chain; it's
     exactly what each row narrows for. (Identity-equality → `IDENTITY_KEY[x.type](x)` returning
     a type-prefixed string; pick resolution → `RESOLVE_PICK[entry.type]`.)

**This is a REVIEW gate, not only a design lens.** Run it against every diff — your own and a
subagent's. Per-type branches / enumerated table keys in a returned diff are a STOP-and-fix, not
a thing to rationalize. When the gate fires on one file, **sweep the WHOLE diff** for the same
shape (`\.type ===`, `\.kind ===`, `switch (…type)`) and fix every instance in one pass — fixing
only the file someone pointed at leaves the siblings (the 2026-06-16 miss: three chains survived
because the gate ran on InfoCard alone). When dispatching an implementer to touch a tagged
union's rendering/dispatch, the prompt must explicitly forbid per-type branches and require
`TABLE[x.type]`.

### 8. One canonical home — single source of truth

The same fact in two places is a braid between them: they can drift, and now you must
hold both in mind. Give every constant, encoding, and piece of status exactly one home.

- **Skymap:** `selectionEncoding.ts` is the single home for the `(source << 27) | idx`
  pack layout — a sister `.wesl` mirrors it and a _parity test_ asserts they stay in
  lockstep (the alternative — open-coding the magic numbers across five files — once meant
  "the wrong galaxy highlights when you click"). Config like `VITE_DATA_BASE_URL` is read
  from `.env.production`, not re-hardcoded. Per-type stores (ADR 0005) make each data type's
  _status_ live in one place — the renderer is never the source of truth for it.
- **Do:** centralise; when two languages / layers must agree, add a parity test.
- **Don't:** copy a constant "for convenience".

### 9. Modular is not simple — compose un-braided pieces

Partitioning and layering are _enabled by_ simplicity; they don't _create_ it. You can
have separate classes / files that call each other nicely and are still completely
complected — "this thing presumes that thing never returns the number 17." Don't be
fooled by code organisation.

- **Skymap:** ADR 0005 names a real instance — a `poiSubsystem` that looked modular but
  conflated a _data store_ with two per-frame _producers_ under a presentation-role name.
  The fix isn't "more files"; it's separating _what a thing is_ (data type) from _how it
  draws_ (presentation mechanism), then composing.
- **Do:** verify separated units don't depend on each other's hidden internals.
- **Don't:** treat folder structure as proof of decoupling.

## Organizing code

How the _layout_ should express simplicity:

- **Separate "what a thing is" from "how it draws / works."** This is the load-bearing
  axis in skymap (ADR 0005): data type (galaxy / structure / filament / volume) vs
  presentation mechanism (point / thumbnail / marker / label / line / volume). Organise
  primarily by _what_; let presentation mechanisms be shared and fed by multiple types.
- **Pure data layer, no service imports.** `src/data/` (e.g. `SOURCE_REGISTRY`) is identity
  - defaults only; it must not import `services/`. Keep the strand that says _what exists_
    separate from the strand that says _how it loads_.
- **One concept per unit.** One type per `@types` file; one function per single-function
  file; no component barrels. Each file is a strand you can read in isolation.
- **Registries over scattered conditionals** (#7). A new source / category / POI is a row,
  not a new branch in N switch statements (use the `add-data-source` skill).
- **Queues to decouple producer / consumer** (#6, when/where).
- **Where things go:** keep the `services/` split (camera / engine / gpu / input);
  cross-cutting pure helpers in `utils/`; rendering subsystems in `services/gpu/`; tests
  mirror the `src/` tree.

## Writing code

At the keystroke level, reach for the simpler construct:

- **Values over places.** `readonly`, `as const`, pure functions, copy-on-write. A function
  that returns the same output for the same input is one you can reason about.
- **Data over syntax / classes.** Represent information as records / maps / sets; `type`
  aliases, never `interface`; `Vec2` / `Vec3` aliases, never raw tuples.
- **Discriminated unions + exhaustive `switch`** over open-coded magic numbers; let the
  compiler force every call site when a variant is added.
- **Small interfaces; inject subcomponents.** Take dependencies as arguments (named-bag
  factory args, per `renderers.md`), not hardwired singletons.
- **Don't let an abstraction dictate _how_.** Prefer declarative shapes; beware the
  `fold`-style ordering implication baked into a "neutral" helper.
- **Concentrate mutation.** If you must hold state, wrap it so the outside sees a functional
  interface; never let a mirror copy drift from its authoritative home.
- **Single source of truth** for every constant / encoding (#8).
- **Perf carve-out.** The immutability defaults bend only on a _measured_ hot path (the
  per-frame loop over ~2.5M points). Localise and comment the carve-out; it is the
  exception, not a licence.

## Refactoring this codebase

**Start honest:** much of skymap predates these principles. Expect to find state where a
value would do, information wrapped in methods, closed switches on `source`, and "modular"
units that quietly presume each other. That's normal — the job is disentangling, and it's
incremental.

The method (Hickey's "simplify = disentangle"):

1. **Follow the strands.** Trace what actually depends on what — the call graph, not the
   folder names. Don't assume blast radius; verify it.
2. **Label everything.** Name each concern (the who / what / when / where / why / how of the
   tangle). Naming the strands is most of the work.
3. **Pull apart, then compose.** Separate the independent concerns; reconnect through thin
   seams (registry rows, queues, small interfaces, a single install step).

Working rules:

- **Generalise repeated fixes.** The second `if (source === X)` — or the second hardcoded
  list edit — means _consolidate_. The duplication is the bug.
- **Tidy the strands you touch.** When you're already in a file, untangle what you reasonably
  can and bring its comments to current state. Don't gold-plate unrelated knots.
- **Land de-complecting as its own small PRs** (branch + PR, squash-merge). A refactor PR
  that also adds behaviour hides the strand you were pulling.
- **Run the radar — at design time too, not only on the diff.** Use the `entanglement-radar`
  skill on the diff before you call a refactor done; it names the complecting and proposes the
  un-braided shape. But the cheapest moment to un-braid is _while writing the spec/plan_, before
  the shape is in code — so run the lens then as well.
- **Asymmetry-language is a STOP signal.** When you catch yourself writing a section to teach how
  to _handle_ an "asymmetry" / "the subtlety" / "special-case" / "must remember to", that prose
  is the confession, not the diligence: documenting a knot well is not removing it. Ask one
  question — is the difference **essential** (any reasonable implementation of the domain has it)
  or **accidental** (an artifact of how state is stored)? Test against a sibling. Un-braid the
  accidental before the plan locks it in; document only the essential.
- **Escalate, don't hack.** If a clean de-complecting is blocked by something structural, stop
  and surface it rather than re-braiding around it.

## Known entanglements (a starting set, not an audit)

These are _documented_ knots — seeded from `renderers.md`'s "Known outliers", ADR 0005, and
the encoding module. They are a worked example of the radar, **not** a census; the codebase
has more. Don't model new code on them.

- **`wireSlots` conflated two axes** (ADR 0005) — data type vs presentation mechanism braided
  into one ~530-line phase with three hand-maintained passes over the same slot set. _Being
  de-complected:_ per-type stores (`src/services/engine/data/create*Store.ts`) have landed;
  demand-driven loading + the presentation split follow. A positive in-flight example of
  pulling strands apart.
- **`scalarVolumeRenderer` mirror state** (`renderers.md` outlier) — per-field enablement,
  intensity, contrast, palette duplicated inside each `FieldEntry` instead of read from the
  authoritative `EngineState` (value/place complecting; #5, #8).
- **`pickRenderer` shares `pointRenderer.uniformBuffer`** (`renderers.md`) — the only
  cross-renderer shared mutable resource; load-bearing today, but the clean home is a
  selection-pack module (#5).
- **Positional factory args** on `galaxyPointRenderer` / `galaxyPickRenderer` / `filamentRenderer` /
  `scalarVolumeRenderer` (`renderers.md`) — `(device, format, …)` braids argument _order_ into
  every call site; convert to a named bag when you next add an arg (#3; #6, _what/how_).
- **`render` vs `draw` naming** on `labelRenderer` / `markerLineRenderer` (`renderers.md`) — a
  small consistency strand; rename when you touch them.
- **`unpackPickGalaxyOnly` shim** (`selectionEncoding.ts`) — a deprecated transitional duplicate
  of `unpackPick`; remove when the last caller is migrated.
- **Selection-writer action set hand-listed in two watchers** (`selectionWakeSaga.ts`,
  `selectionRowsSaga.ts`) — the "which actions write a selection ref" set is enumerated
  independently by the render-wake saga and the rows-reconciler saga. Adding a writer
  (`clearSelection`) means remembering to extend _both_ lists; both forgot it, producing two
  separate Esc bugs (stale rows `21e5f123`, lingering ring `c178c11c`). The braid is _the writer
  set_ × _each consumer's copy of it_. Un-braided shape: derive both off a single "selection
  changed" signal (one saga emits a `selectionChanged({slot})` event the wake + reconcile sagas
  take), or co-locate the writer-action list as one exported constant both `takeEvery` against —
  so a new writer can't satisfy one consumer while starving the other.

## Entanglement-radar checklist

A quick pass for review and refactor (the `entanglement-radar` skill runs this against a diff):

- Could any two of these things change **independently**? If so, why are they braided?
- Am I judging this by the **typing** or by the **running artifact**?
- Is this a **value or a place**? Same input → same output?
- Is this **information wrapped** in a class / method? Leave it as data.
- One **canonical home**, or a mirror copy that can drift?
- Can I name the **single reader and single writer** of this state, and do they agree? A field
  written by one path but read-for-truth by another is a mirror (often a dead one) — fold to one home.
- Does this spec/plan section exist to **teach handling of an asymmetry / exception / special-case**?
  Classify essential (any implementation has it) vs accidental (an artifact of storage); un-braid
  the accidental at design time rather than documenting it.
- Does this **switch / conditional** on a discriminant belong in a registry or a union?
- Is a **two-way predicate going three-way** (or am I sniffing `'field' in x` / casting in a
  predicate's false-branch)? That's the trigger to add a `type` tag and dispatch by `Record<Tag, …>`
  table — not a third predicate.
- Is the **interface** as small as it could be? Are subcomponents injected, not hardwired?
- Is **what** separated from **how**? Does the abstraction leak _how_?
- Does A **call B directly** where a queue would remove the when/where coupling?
- Is this "modular" but actually **presuming another unit's internals**?

A finding is a _real knot_ (two independent things braided), not a matter of taste (names,
formatting). "No significant complecting found" is a valid result.
