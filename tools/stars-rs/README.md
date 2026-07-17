# stars-rs — Gaia star-catalog builder (canonical real-scale pipeline)

Rust reimplementation of the Gaia star-bin build. It reads the paged Gaia DR3
CSVs plus the GCNS 100 pc supplement and the Hipparcos-2 bright-star patch, and
emits the per-tier SKST binaries `public/data/stars-{small,medium,large}.bin`
the browser renderer loads.

This is the **canonical builder for real-scale runs**. The TypeScript builder at
`tools/stars/buildStars.ts` is the **reference implementation** — it is the
executable spec, and the one the vitest suite exercises. This crate is a
speed-and-memory rewrite of that spec: it produces **byte-identical** output far
faster and with a much lower memory ceiling than the ~16 GB the TS build needs
to hold the full Gaia superset in a Node heap.

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
--out public/data`. The binary resolves its raw inputs from `data/raw/gaia`
(anchored to the crate location, so cwd does not matter) and writes the three
`.bin` files to `public/data`. Both directories can be overridden:

```bash
cargo run --release -- [--data <gaia dir>] [--out <dir>] [--pages <n>] [--compare <ref bin dir>]
```

- `--pages` caps the number of Gaia CSV pages read (a fast partial build for
  bring-up).
- `--compare <dir>` prints a field-by-field equivalence report against a set of
  reference `stars-*.bin` files (used to confirm parity with the TS builder).

## Bit-parity contract with the TS builder

The two builders are held to produce the same `.bin` bytes from the same raw
inputs. The port mirrors these five behaviours from `tools/stars/buildStars.ts`
exactly (each has a corresponding constant/test in this crate):

1. **Mean-flux aggregate encode.** Octree aggregate nodes carry their subtree's
   summed linear flux and star count *unquantized* up the tree, and the emitted
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

Two documented, accepted sources of rare divergence at the quantization-bin
boundary: `libm` sin/cos vs V8's fdlibm port may differ by ulps, and zlib-ng's
deflate may pick a truncation `k` a hair off Node's zlib. Neither has ever moved
the output — the current builds are byte-identical across the three tiers — but
the equivalence report (`--compare`) tolerates them by design.

## Tests

```bash
cargo test
```

The unit tests cover the record packing/gzip layer, Morton round-trips, the
octree leaf-merge and flux-aggregate reconstruction, the GCNS distance-unit
boundary, and the splitmix64 taper known-answer — the behaviours where a silent
drift would break parity with the reference builder.
