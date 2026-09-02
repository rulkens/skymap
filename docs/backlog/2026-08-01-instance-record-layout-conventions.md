# Packed per-instance record layout is four hand-maintained conventions

Surfaced by the entanglement radar during the orbit-trail ribbon-impostor work
(2026-08-01). Not branch-invented — the pattern predates it in every instanced
renderer.

## The knot

Four renderers each pack a per-instance record into one `Float32Array` and each
invent the same conventions independently:

| renderer          | floats |
| ----------------- | ------ |
| `planetRenderer`  | 28     |
| `structureMarker` | 12     |
| `bodyGlint`       | 7      |
| `orbitTrail`      | 34     |

(`planetRenderer` moved 24 → 28 in #634, unnoticed here until this backlog
sweep — itself evidence for the item: the table drifted from the code with
nothing to catch it.)

For each one, a single fact — "this record has these fields in this order" — is
encoded three times in three languages that nothing cross-checks:

1. `INSTANCE_ATTRIBUTES` in the renderer (byte offsets + `format` strings),
2. the WESL instance struct (`@location(N)` + WGSL types),
3. the layer's pack loop (bare float indices, `staging[base + 17] = …`).

A fourth encoding usually exists in prose: a comment table in the renderer or
`@types` file restating the byte map.

## Why it earns a fix

The orbit-trail record moved 28 → 40 → 32 → 34 floats over one branch. Every
move required the same edit at five sites, and one site (the `.d.ts` doc)
silently fell behind and shipped wrong — caught only by a reading pass, not by
any test. A missed site does not fail to compile: it reads adjacent floats as
the wrong field and draws garbage geometry on hardware, which is the most
expensive class of bug this codebase has.

The three-site contract is stated in prose in several places as "must agree
byte-for-byte". A contract that must be maintained by hand and is checked by
nothing is a convention, not a contract.

## Direction (not yet a design)

A data table per renderer — field name, float count, `format` — from which
`INSTANCE_FLOATS`, `INSTANCE_STRIDE`, `INSTANCE_ATTRIBUTES` and named pack
offsets all derive, so the TS side has one source of truth. The WESL side
cannot import TS, so it stays a hand-mirror pinned by a parity test.

Precedent for both halves already exists in-repo:

- `src/data/flow/flowFieldConstants.ts` ↔ `flow/constants.wesl` ↔
  `tests/services/gpu/shaders/constants.parity.test.ts` — the hand-mirror +
  parity-test pattern.
- `tests/services/gpu/shaders/orbitTrailConstants.parity.test.ts` (extended
  2026-08-01) pins the orbit-trail `OrbitInstance` struct against that
  renderer's `INSTANCE_ATTRIBUTES` — location coverage both ways, WESL type ↔
  attribute format, and the float-count/stride arithmetic. That is the template
  for the other three renderers.

Open question worth answering before speccing: whether the four renderers share
one helper or each keeps its own table. They differ in more than size (some
records are per-frame rewritten, some grow with the catalog), so a forced
abstraction may braid things that genuinely vary. Do the ideal-diff pass.

## Scope note

The orbit-trail branch took only the detectable-drift half (the parity test) and
deliberately left the deduplication. Picking this up means doing it for all four
renderers, or explicitly deciding not to.
