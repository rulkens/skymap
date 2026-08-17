# Comments — didactic, and budgeted

> **Audience.** Anyone writing or reviewing skymap code — directly, in a plan, or
> as a dispatched implementer. This is the counter-pressure to "explain why".
>
> **Status.** Conventions doc — the Do/Don't lines are prescriptions. It exists
> because the previous rule ("explain why _and what the alternative was_; many
> files have multi-paragraph module headers — match that style") had no upper
> bound, and unbounded is what it produced. Measured 2026-07-30 across the 1364
> source files on `main`: **60,476 comment lines against 46,520 code lines**, a
> median file ratio of 1.56, a median module header of 23 lines, and **71% of
> files carrying more comment than code**. No individual author overdid it; the
> rule did what it said at scale.

## The one question

Judge every comment by:

> **Does this record something a reader would otherwise rediscover the hard way —
> or is it retelling what the code already says?**

Comments are the only artifact in the repo that nothing verifies. A test that
drifts fails; a type that drifts fails to compile; a comment that drifts just
lies, quietly, until someone trusts it. That asymmetry is the reason to write
fewer and better, not more.

## The budget

- **Module header ≤ 10 lines.**
- **Comment lines ≤ half the code lines in the file.**

Not a lint gate — a default you should be able to justify departing from in a
sentence. Two kinds of file legitimately run over, and both should say so in
their header's first line: a byte-layout or wire-format contract (see
`packEarthSurfaceUniforms.ts`, where the layout table _is_ the source of truth
shared with WGSL), and a shader whose maths is unreadable without the derivation.

Past the budget, one of two things is true. Either the material is not
load-bearing — cut it. Or it is, but it belongs somewhere durable: link the spec
or plan instead of inlining a summary that will drift from it.

## Earns its place

**A landmine.** A fact that cost real time to discover and would cost it again.
Includes the special case of a choice that _looks_ wrong and would get "fixed"
back into a bug.

- `sharp` applies `.composite()` over the already-resized image regardless of
  call order — this silently produced every coarse Earth tile as a 1:1 copy of
  its north-west child.
- `TextureAtlas.allocate`'s LRU scan uses a strict `<`, so it could evict a slot
  claimed earlier in the same frame and drive a refetch loop.
- `textureSampleLevel`, never `textureSample`, where atlas uv jumps at a slot
  boundary and implicit derivatives are garbage.

**A unit or a frame.** Mpc vs km, radians vs degrees, CSS px vs texture px, which
`v` is the south pole, sRGB vs linear. Wrong units are silent.

**A derivation.** The arithmetic behind a constant or a formula, so the next
person can re-derive rather than trust. Keep the maths; cut the prose around it.

**A cross-file contract.** "Must agree byte-for-byte with the WGSL struct." "Row
0 of every tile is its north edge; the flip is reconciled CPU-side." Anything
where editing this file alone breaks something in another.

## Doesn't earn its place

- **Restating the code.** `// increment i` above `i++`. A field named
  `slot: number` documented as "the slot number".
- **Research surveys and option comparisons.** Genuinely valuable, wrong home —
  they belong in the spec or plan, which is version-controlled prose meant for
  exactly this. Link it.
- **History.** "This used to be 3000." "The first draft did X." "Found during
  D6." Comments describe the design as it stands now; the git log holds how it
  got here. A comment written as a diff is stale the moment the next change lands.
- **Echoes.** The same fact explained in three files. It has one home; the others
  point at it or say nothing.
- **Essays on a type.** A `.d.ts` exporting one type needs a line of purpose plus
  units on the non-obvious fields, not a page.
- **Decorative banners.** A box-drawing divider carrying no information is
  formatting, not documentation.

## Migrating the existing 60k lines

**Opportunistically, never as a sweep.** Bring a file under budget when you are
already editing it for another reason. A mass comment rewrite is an enormous
diff with no behaviour change, it cannot be meaningfully reviewed, and it
destroys `git blame` across the tree — the cost lands on every future
investigation, which is precisely the thing good comments are supposed to help.

## See also

- [`testing.md`](testing.md) — the same shape of counter-pressure, applied to the
  test suite, and the audit that motivated it.
- [`simplicity.md`](simplicity.md) — a comment that exists to teach handling of an
  accidental asymmetry is a signal to un-braid the code instead of documenting it.
