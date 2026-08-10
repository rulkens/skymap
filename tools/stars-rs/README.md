# stars-rs — Gaia star-catalog builder (canonical real-scale pipeline)

Rust reimplementation of the Gaia star-bin build. It reads the paged Gaia DR3
CSVs plus the GCNS 100 pc supplement and the Hipparcos-2 bright-star patch, and
emits the per-tier SKST binaries `public/data/star-catalog/v1/stars-{small,
medium,large}.bin` the browser renderer loads (`constellations.json` writes
straight to the `--out` dir, unversioned).

This is the **canonical builder for real-scale runs**. The TypeScript builder at
`tools/stars/buildStars.ts` is the **reference implementation** — it is the
executable spec, and the one the vitest suite exercises. This crate is a
speed-and-memory rewrite of that spec, far faster and with a much lower memory
ceiling than the ~16 GB the TS build needs to hold the full Gaia superset in a
Node heap. It shares the reference's encode/quantize/tier pipeline behaviour for
behaviour, and adds two dedup rules the reference does not have — so its output
subtracts a few more stars than a TS build of the same inputs. See
[Parity with the TS builder](#parity-with-the-ts-builder).

## Prerequisites

A Rust toolchain (stable, edition 2021). Install via [rustup](https://rustup.rs):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

`Cargo.lock` is committed so the dependency graph is pinned — a reproducible
build needs the exact `flate2`/`zlib-ng` versions, since the compressed size
drives the per-tier truncation search (see below).

## Usage

From the repo root:

```bash
npm run build-stars-rs
```

which runs `cargo run --manifest-path tools/stars-rs/Cargo.toml --release --
--out public/data`. `--out` names the data root, same as the TS builder's
`--out-dir` — the binary resolves its raw inputs from `data/raw/gaia`
(anchored to the crate location, so cwd does not matter) and writes the three
`.bin` files under `public/data/star-catalog/v1/`. Both directories can be overridden:

```bash
cargo run --release -- [--data <gaia dir>] [--out <dir>] [--pages <n>] [--compare <ref bin dir>]
```

- `--pages` caps the number of Gaia CSV pages read (a fast partial build for
  bring-up).
- `--compare <dir>` prints a field-by-field equivalence report against a set of
  reference `stars-*.bin` files (used to confirm parity with the TS builder).

## Parity with the TS builder

The two builders share one encode/quantize/tier pipeline. The port mirrors these
five behaviours from `tools/stars/buildStars.ts` exactly (each has a
corresponding constant/test in this crate):

1. **Mean-flux aggregate encode.** Octree aggregate nodes carry their subtree's
   summed linear flux and star count _unquantized_ up the tree, and the emitted
   record stores the subtree's **mean** star flux
   (`-2.5·log10(total_flux / star_count)`), not the summed flux — so the 7-bit
   magnitude LUT sized for a single star never clamps, and flux is conserved
   across LOD with no inter-level pow/log round-trip. (`octree.rs`)
2. **10-bit Morton grid.** `DEFAULT_MORTON_BITS = 10` → a 1024³ leaf grid; a
   node's 30-bit Morton index stays inside the SKST `u32` with no format bump.
   (`population.rs`, `morton.rs`)
3. **12 kpc distance cap.** `MAX_STAR_DISTANCE_PC = 12_000` drops far LMC/SMC and
   bad-parallax outliers before the grid is derived, keeping every fixed-`2^bits`
   leaf cell tight around the local sample. (`population.rs`)
4. **Leaf-capacity merge.** `STAR_LEAF_CAPACITY = 64` fat leaves: a cell with ≤ 64
   stars stays a single leaf holding all its records; the `child_mask == 0`
   discriminant marks a leaf at any level (never the level itself). (`octree.rs`)
5. **GCNS supplement taper.** The faint nearby-dwarf supplement's outer shell is
   thinned from a keep-probability of 1 at 70 pc to 0 at 100 pc
   (`SUPPLEMENT_TAPER_START_PC` / `SUPPLEMENT_TAPER_END_PC`), with the keep/drop
   coin a pure `splitmix64` hash of the star's Gaia DR3 `source_id` — never a
   stateful PRNG — so the decision is order- and language-free. Known answer:
   `splitmix64(0) = 0xE220A8397B1DCDAF`, matching
   `tools/utils/random/splitmix64.ts`. (`taper.rs`)

Across those five behaviours the two builders agree to the bit, modulo two
documented, accepted sources of rare divergence at the quantization-bin boundary:
`libm` sin/cos vs V8's fdlibm port may differ by ulps, and zlib-ng's deflate may
pick a truncation `k` a hair off Node's zlib. Neither has ever moved the output;
the equivalence report (`--compare`) tolerates them by design.

### Canonical-builder-only dedup

The Rust builder additionally applies two dedup rules that the TS reference does
not, so its population subtracts a few more stars than a TS build of the same raw
inputs. These are deliberate — the canonical real-scale builds carry them — not
drift. `cargo run -- --compare <ref bin dir>` surfaces their subtractions as
unpaired records in the equivalence report; that is the expected shape of the
delta, not a parity failure to chase back into byte-agreement. Do **not** port
them into `tools/stars/`; the TS builder stays the leaner executable spec for the
five shared behaviours above.

1. **Famous subtraction over Gaia ∪ HIP.** The famous-star seed carries two dedup
   keys — a Gaia `source_id` and a Hipparcos `HIP` — because the brightest famous
   stars saturate Gaia DR3 and are seeded by HIP with no Gaia id. The subtraction
   set is the union: the curated Gaia ids, plus the Gaia twin each famous HIP
   resolves to through the crossmatch, plus the famous HIP companions subtracted
   directly by HIP in the bright-Hipparcos patch (catching saturated stars that
   have no Gaia row at all). This keeps a famous body from also appearing as an
   ordinary catalog point. (`population.rs` — `famous_gaia_subtraction`,
   `FAMOUS_STAR_HIP_IDS`)
2. **Positional crossmatch-gap fallback.** A bright Hipparcos star missing from
   `hip2_best_neighbour` has no crossmatch-resolved Gaia id to subtract, so its
   Gaia twin would otherwise survive as a duplicate scene body next to the bright
   patch's HIP copy. For each such unmatched bright star, the nearest bright Gaia
   source within a small angular radius and magnitude window is taken as its twin
   and subtracted positionally. (`population.rs` — `positional_gap_subtraction`,
   the `positionalGapSubtracted` drop counter)

## Tests

```bash
cargo test
```

The unit tests cover the record packing/gzip layer, Morton round-trips, the
octree leaf-merge and flux-aggregate reconstruction, the GCNS distance-unit
boundary, and the splitmix64 taper known-answer — the behaviours where a silent
drift would break parity with the reference builder.
