# Testing — what NOT to test

> **Audience.** Anyone writing or reviewing a skymap test — directly, in a plan
> (`superpowers:test-driven-development`), or as a dispatched implementer. This is
> the counter-pressure to "write tests".
>
> **Status.** Conventions doc — the Do/Don't lines are prescriptions. It exists
> because the suite grew to 4,100+ tests by following "write tests" with **no
> counter-pressure**: every plan said _write tests_, none said _what not to test_,
> and the crud compounded. The 2026-07-10 audit cut ~438 tests (~11%) that fail on
> legitimate changes but almost never on real bugs; this doc is the guardrail that
> keeps them from regrowing. The full reasoning is in
> [`docs/grill-sessions/test-suite-overtesting-audit-2026-07-10.md`](../../grill-sessions/test-suite-overtesting-audit-2026-07-10.md).

## The one question

Judge every test by:

> **Will this ever fail on a real bug that no other test or compiler check
> catches — or does it mostly fail on legitimate changes?**

A test that only breaks when someone _deliberately_ edits the thing it mirrors is
not a safety net; it's a tollbooth on every future change. Tests and types are
guardrails, not the goal ([`simplicity.md`](simplicity.md)): a guardrail that
never stops a crash and only slows the car down is a wall in the wrong place.

## Anti-patterns — don't write these

### No runtime tests of type declarations

`tsc --noEmit` (run in CI via `npm run typecheck`) already proves every type
fact. An `expectTypeOf` file, an "accepts a string literal" assignability check,
or a runtime assertion that a value has a field the type already guarantees is a
**compile-time fact restated at runtime** — it can only fail when the compiler
would already have failed louder and earlier.

- **Don't:** `expectTypeOf(x).toMatchTypeOf<Foo>()`; `const _: Foo = { … }` "does
  it compile" smokes; asserting `typeof entry.code === 'number'` on a typed field.
- The whole `tests/@types/` tree was deleted in the 2026-07-10 audit for exactly
  this reason — it was the type system typing itself.

### No constant / registry restatements

Asserting a literal, a default object, or an **exact registry entry list** back at
itself is a change-detector. Every legitimate addition breaks it, and the failure
it "guards against" — accidentally deleting a static literal — is already plainly
visible in the `git diff` a human reviews.

- **Don't:** `expect(DEFAULT_SETTINGS).toEqual({ … })`; `expect(clipRegistry.map(c => c.id)).toEqual([ …21 ids… ])`; `expect(FONT_IDS).toEqual([ … ])`.
- **Do:** keep the **structural invariants** — `id === key`, non-empty `label`,
  no duplicate codes. Those catch real copy-paste bugs and don't break when the
  set legitimately grows. (A count lower-bound is only meaningful for a registry
  assembled _dynamically_; none of skymap's are.)

### No clamp-boundary tests

At `x === bound`, `Math.min`/`Math.max` return the bound under **either**
comparison operator, so a "returns the floor at the exact floor" test is
observationally vacuous — it can only fail if the bound _constant_ changes, which
makes it a CONSTANT restatement in disguise.

- **Don't:** the 8 "returns `<bound>` at the exact boundary" tests that sat around
  `clampVolume` (cut in the audit).
- **Do:** keep boundary tests **only** where the two operators produce _different_
  outputs at the boundary — threshold **classifiers** like `galaxyTypeFromColor`
  (its `≤`-semantics) and `galaxyTypeFromJminusK`. There, `<` vs `<=` genuinely
  reclassifies the boundary value, so the test is load-bearing. The mechanical
  rule: **a boundary test stays iff the two operators are observationally
  distinguishable at the boundary.**

### No MIRROR tests

Never compute the expected value with the **same formula or function the source
uses**. Importing the function under test to build the expectation, or copying its
body into the test, makes the assertion a tautology: it passes as long as the code
equals itself, so it can't catch a wrong formula — the bug flows into both sides.

- **Don't:** `expect(deproject(p)).toEqual(deprojectExpected(p))` where
  `deprojectExpected` is the same maths; `expect(f(x)).toBe(f(x))`; re-deriving the
  expected pack value with the source's own bit-shift expression.
- **Do:** assert against **hand-computed** values (a number you worked out on
  paper), a **round-trip** (`decode(encode(x)) === x`), or an **independent
  property** — monotonicity, a conservation invariant, symmetry, a known fixed
  point. Those fail when the formula is wrong; a mirror never does.

### No source-text greps

A test that `readFileSync`s the source and asserts a substring is a
**rename-detector**, not a behavior test. It passes broken behavior as long as the
string is present and fails correct behavior the moment someone renames a variable.

- **Don't:** `expect(src).toContain('const MAX_LOD = 6')`; asserting a function is
  called by grepping for its name in the file text.
- **Do:** exercise the behavior through the public surface and assert the observable
  result.

### No full-object golden snapshots of presentation data

A `toMatchSnapshot` / `toEqual` over an entire formatted InfoCard payload, status
object, or label bundle forces a **re-bless on every legitimate field or format
tweak** — so the snapshot trains reviewers to re-bless blindly, which is exactly
when a real regression slips through.

- **Don't:** snapshot the whole formatted object.
- **Do:** pin the **specific branch behaviors** you care about with targeted
  assertions — "distance formats with 1 decimal", "negative cz shows the
  Local-Group note", "missing PA omits the orientation row" — each a line that
  fails for one reason.

## Keep-rules — load-bearing tests that _look_ like constant tests

These assert literals too, but the literal is a **contract with something outside
the test's control** (bytes on disk, another language, upstream data, a past bug).
Deleting them loses real coverage. Keep them.

- **On-disk / persisted format tests.** `galaxyCatalogFormat` v6 byte offsets,
  `scalarFieldFormat`, `structureCatalogFormat`, `filamentBinaryFormat`, the
  `selectionEncoding` `(source << 27) | idx` bit layout, and the **append-only**
  source codes in `sources.ts`. The `.bin`/`.ccat`/`.scfd` files hosted on R2 must
  match these bytes exactly; a changed offset silently mis-decodes shipped data.
  These are the single canonical home for the format — the test is the enforcement
  ([`simplicity.md`](simplicity.md) #8).
- **WGSL/TS parity + uniform byte-layout tests.** `packPointUniforms` field
  offsets, `constants.parity` (WESL ↔ TS), the `SLOTS_PER_POINT` vertex stride.
  They catch shader/TS drift that is **invisible until iOS silently drops the whole
  frame** — WebKit rejects a mislaid uniform that Chrome's Tint tolerates, and the
  canvas just stops presenting with no thrown error. See the CLAUDE.md "things that
  have bitten us" note.
- **Parser tests against fixture bytes.** A parser test that feeds real (or
  ReadMe-accurate) fixed-width / binary fixture bytes and asserts the decoded record
  is testing the **contract with upstream data** — the VizieR ReadMe byte offsets.
  That's a genuine external interface, not a self-restatement.
- **Regression tests citing bug history.** A test whose comment names the bug it
  reproduces (e.g. the "wrong galaxy highlights" selection-index race, the retry
  storm on failed thumbnails) is load-bearing by construction — it fails exactly
  when the specific bug returns.
- **Behavioral tests of pure functions with hand-computed expectations.** Even a
  one-line pure helper deserves a test whose expected value was computed
  _independently_ of the implementation. Simplicity is not a reason to skip it; a
  mirror is (see above).

## When a test is flagged

When a reviewer (or the `entanglement-radar` / `code-review` pass) flags a test as
one of the anti-patterns above, **the default is delete, not defend.** The burden
is on keeping it: name the real bug it catches that no other test or compiler check
does. If you can't, it's a tollbooth — remove it. The audit record and the
category definitions live in
[`docs/grill-sessions/test-suite-overtesting-audit-2026-07-10.md`](../../grill-sessions/test-suite-overtesting-audit-2026-07-10.md).
