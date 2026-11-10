# cloud-bake-rs — phase-2 VIIRS cloud bake (feasibility spike)

Native Rust port of the live-cloud candidate bake that produced
`public/cloud-candidates/viirs-seamless.webp`: NOAA-20 VIIRS granule orbits and the two GIBS daily
mosaics joined into one composite with min-cut seams and multiband blends, the gaps filled from
geostationary IR matched to the time of the bordering swath, written as an 8192x4096 lossless RGBA
WebP whose alpha is cloud opacity.

The executable spec is the Python pipeline in the live-cloud session scratchpad
(`scripts/seam_viirs_p2.py` run with `P2_FLOW=0`, plus `seam_viirs.py`, `geofill.py`, `geofetch.py`,
`orbit.py`, `fetch_granules.py` and `bake.py`'s `write()` / `match_baseline()` / `ice_sheets()`).
Motion flow (`flowmorph.py`) is not ported, by ruling. Nothing here is wired into npm scripts or a
workspace; it is a spike for a Cloudflare Container run.

## Prerequisites

A stable Rust toolchain and a C compiler: libwebp (via `libwebp-sys`) and libjpeg-turbo (via
`mozjpeg`) are built from vendored C with `cc`, no cmake. On x86_64 install `nasm` to get
libjpeg-turbo's SIMD decoder; without it the build falls back to plain C.

## Usage

```bash
cargo run --release -- --bake <scratchpad>/bake --textures <repo>/data/raw/textures \
  --out ../../public/cloud-candidates/viirs-seamless-rust.webp [flags]
```

| flag | meaning |
| --- | --- |
| `--bake <dir>` | the Python cache layout: `granules/` (`hi_meta.json`, `hi/`, `orbit.json`), `viirs/` (daily mosaics), `geo_p2/` (`calib.json`, `frames/`); the colour map is read from `<dir>/../gibs/colormaps/ir.xml` |
| `--textures <dir>` | `cloud_combined_8192.tif` (baseline) and `world.topo.bathy.200412.3x21600x10800.jpg` (Blue Marble, for the ice mask) |
| `--out <file>` | the WebP to write |
| `--fetch` | fetch whatever is missing (granule footprints + granules, both mosaics, every geostationary frame the fill plans), concurrently: 6 GIBS and 4 EUMETView connections, as the Python. Without it a cache miss is fatal |
| `--no-geofill --geo-ir <geo-ir.webp>` | fill the gaps from the single 12:00Z `geo-ir.webp` instead (the Python's `P2_GEOFILL=0`) |
| `--threads <n>` | rayon pool size (default: all cores, or `RAYON_NUM_THREADS`) |
| `--webp-quality <q>` / `--webp-method <m>` | libwebp lossless effort, default 25 / 4 (Pillow's 80 is ~10 s slower for 2.6% fewer bytes) |
| `--compare <ref.webp>` | print mean / p99 / max absolute alpha difference against a reference |
| `--dump <dir>` | write the composite stage (`op.f32`, `cv.u8`, `labels.i8`) for stage-wise parity checks |
| `--webp-image-crate <file>` | also encode with the pure-Rust `image` encoder, for the size/speed comparison |

`orbit.json` (the fitted NOAA-20 node), `calib.json` (the frozen 12:00Z MTG/IODC LUTs and quantile map)
and `ir.xml` (the GIBS IR colour map) are static inputs, as they are for the Python; everything else is
fetched by `--fetch`. The date (2026-11-06) is fixed, as in the Python.

## Modules

One module per stage, plus the numeric primitives the stages share.

| module | Python | what |
| --- | --- | --- |
| `fetch` | `fetch_granules.py`, `geofetch.py` | cached WMS pulls, same file layout |
| `sources` | `load_orbits`, `load_mosaics`, `fill_specks`, `hybridise` | the 13 sources; orbits held as row bands |
| `seam` | `fit_gain`, `nadirness`, `edge_weights`, `cut` | the per-join seam decision at 2048x1024 |
| `maxflow` | PyMaxflow | Boykov–Kolmogorov on the wrapped grid |
| `blend` | `multiband` | Laplacian-pyramid blend, windowed |
| `composite` | `composite`, `fill_holes`, `match_baseline` | the join loop and its tail |
| `orbit` | `orbit.py` | pass times |
| `geodecode` | `gibs_T`, `sat_layer`, `bake.py ir()` | IR frame -> opacity layer |
| `geofill` | `geofill.py` | time-matched gap fill |
| `imageio` | PIL | decoders, Pillow's BOX resize, the WebP writer |
| `edt`, `label`, `filters`, `quantile`, `grid` | scipy / numpy | distance transform, components, filters, percentiles |

Two departures from a line-by-line port, both exact:

- **Blend window.** `multiband` is linear and reconstructs its first input exactly, so
  `multiband(A, B, M) = A + multiband(0, B - A, M)`. `B - A` is zero outside the overlap and every
  kernel is finite, so the second term is computed on a window around the overlap only.
- **Max-flow labels.** The label is "can reach the sink in the residual graph", the unique minimal sink
  side of the min cut, so it does not depend on the max-flow algorithm or its visiting order.

## Parity

Against the Python on the same cached inputs the alpha channel differs by at most 1/255 (rounding), in
both modes:

| run | reference | mean abs | p99 | max |
| --- | --- | --- | --- | --- |
| `--no-geofill` | `bake/viirs-p2-noflow.webp` (the shipped `viirs-seamless.webp`) | 0.099/255 | 1 | 1 |
| default (geofill) | Python geofill on the same no-flow composite | 0.099/255 | 1 | 1 |

What it took, for whoever touches this next:

- JPEGs decode through libjpeg-turbo, as in Pillow. The pure-Rust decoder differs by 1 LSB here and
  there, which moves the mosaics' `max(RGB) < 12` no-data test, the speck masks, the enclosed-hole set
  and a few cut paths (~2000 px off by more than 32/255).
- Candidate pass times are sampled as numpy's `arange` fills them (`start + i * ((start + step) -
  start)`): they land on 10-minute slot boundaries, and the last ulp picks which frame is fetched.
- scipy quirks reproduced on purpose: `distance_transform_edt` of an all-true mask measures from
  (-1, 0) (hybridise hits it on orbits with no overlap); `binary_closing` erodes at the frame border.

Two Python behaviours that look like bugs are kept on purpose; "fixing" them was tried 2026-11-07 and
made the crops worse:

- the seam cut's DELTA term is a constant per edge (a real cloud-edge cost moved cuts into worse places);
- the coarsest pyramid band takes the side the seam rejected, so each side keeps the low frequencies of the
  swath that continues beyond the overlap (weighting it like the finer bands exposed dark blocks).

## Performance

Warm cache, Apple M-series laptop that other jobs were also loading (wall seconds; the Python took 209 s
with flow, ~195 s without):

| stage | 1 thread | 2 threads | 4 threads |
| --- | --- | --- | --- |
| load (ice mask, baseline, granules, mosaics, hybridise) | 13.8 | 8.7 | 5.9 |
| composite (13 joins: cut + blend + rest, holes, match) | 12.9 | 8.0 | 5.5 |
| feather + geofill (times, correlation pick, slots, decode) | 7.6 | 4.5 | 2.8 |
| WebP write (libwebp, single-threaded) | 15.0 | 12.2 | 14.0 |
| **total** | **49.3** | **33.4** | **28.2** |

The WebP write is the floor beyond 2 threads. For lossless, libwebp's `quality` is the effort knob
(Pillow's libwebp 1.6 on this image): q80 19.0 MB / 17.5 s CPU, q50 19.2 MB / 8.1 s, q25 19.5 MB /
5.1 s, q0 m0 21.9 MB / 1.3 s. The pure-Rust `image` encoder writes 37.5 MB.

Peak live Rust heap is 2.55 GB at any thread count; libwebp adds ~0.8 GB during the write (when the
heap is already lower) and the Blue Marble decode ~0.7 GB at the start. macOS reports ~5 GB max RSS
because its allocator keeps freed pages; on Linux each full-grid buffer is its own mmap, so expect
~3 GB.

A cold run (`--fetch` into an empty cache) downloads 91.7 MB in 778 requests: ~125 s of network
(granules 39 s, mosaics 20 s, geostationary frames 66 s, EUMETView being the slow host), on top of the
compute above.

## Tests

```bash
cargo test --release
```

Max-flow against brute-force min cuts (value and minimal sink side, with the date-line wrap), the EDT
and its nearest-feature indices against brute force, connected components and hole filling, numpy's
percentile and interp, and Pillow's two-pass BOX rounding.
