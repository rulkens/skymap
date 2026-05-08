# Glossary

Terms used across the cosmic-zoom plan, in plain language. If you encounter a term in any spec and aren't sure what it means, look here first.

## Astronomy & physics

**AU (Astronomical Unit)** — Mean Earth-Sun distance, ~150 million km. The natural unit for Solar System distances. 1 AU = 4.85 × 10⁻¹² Mpc.

**parsec (pc)** — The distance at which 1 AU subtends 1 arcsecond of parallax. ~3.26 light-years. The natural unit for stellar distances. 1 pc = 3.24 × 10⁻⁷ Mpc.

**kpc (kiloparsec)** — 1000 parsecs. The natural unit for galactic-scale distances (Milky Way diameter ~30 kpc).

**Mpc (megaparsec)** — 10⁶ parsecs. The unit skymap currently uses globally for all positions. Galaxy clusters are ~Mpc-sized; the local supercluster is ~30 Mpc.

**Gpc (gigaparsec)** — 10⁹ parsecs. The unit for the largest cosmic structures and the observable universe (~14 Gpc radius).

**redshift (z)** — The fractional shift of light wavelengths from a distant object due to cosmic expansion. Higher z = farther away. CMB is at z ≈ 1100.

**peculiar velocity** — A galaxy's motion relative to the Hubble flow (uniform cosmic expansion). For Virgo cluster members, peculiar velocities can be ~700 km/s, scrambling distance estimates.

**Hubble flow** — The uniform cosmic expansion. Galaxies' apparent recession velocities are dominated by Hubble flow at distances >50 Mpc.

**CMB (Cosmic Microwave Background)** — Light from ~380,000 years after the Big Bang, when the universe became transparent. Pervades the sky at ~2.7 K with tiny temperature fluctuations.

**Local Group** — The MW + M31 + M33 + ~80 dwarf galaxies. ~3 Mpc across.

**Local Sheet** — A flattened distribution of nearby galaxy groups around the Local Group, ~10 Mpc across.

**Local Supercluster** — Centered on Virgo cluster, ~30 Mpc.

**Laniakea** — Defined in 2014: the gravitational basin in which the Local Group resides. ~160 Mpc across. "Immeasurable heaven" in Hawaiian.

**filament** — Dense linear structure in the cosmic web; galaxies flow along filaments toward cluster nodes.

**void** — Underdense region between filaments; can be hundreds of Mpc across with very few galaxies.

**ICM (intracluster medium)** — Hot ionized gas filling galaxy clusters. Most of a cluster's baryonic mass. Visible in X-ray.

**dark matter** — Non-luminous matter inferred from gravitational effects. ~5× more mass than visible matter. The DM density field on the Cosmicflows-4 grid is what we render in shell 7.

## Skymap-specific

**point cloud** — The set of galaxy positions+attributes loaded into the renderer. Today's skymap renders ~2.5M points.

**cloud loader** — Existing module that fetches per-source `.bin` files at startup or tier change.

**asset slot** — Planned infrastructure (per-spec `2026-05-07-asset-loading-design.md`) for managing async data loads with abort + commit + activation semantics.

**tier** — A quality level (small / medium / large) controlling per-source point counts. Existing concept.

**ShellId** — Numeric identifier for one of the 9 cosmic-zoom shells.

**ShellRenderer** — Per-shell GPU pipeline owner; implements `isActiveAt`, `fadeAlphaAt`, `render`.

**CameraScale** — The scale-aware camera state: which shell, shellOrigin in heliocentric Mpc (f64), shellUnit conversion factor.

**floating origin** — Technique of subtracting the camera's (or anchor's) position from world coordinates before sending to the GPU, so f32 precision is sufficient near the camera.

**shell origin** — A stable anchor point per shell (Sun for inner shells, M87 for shell 6, etc.) that the GPU coordinates are expressed relative to.

**reverse-Z** — Depth buffer convention where the near plane maps to 1 and the far plane to 0. Pairs well with f32 depth and gives much better precision distribution.

**MSDF** — Multi-channel Signed Distance Field. Font-rendering technique that gives sharp glyphs at any zoom.

**TourEngine** — Planned module that drives the camera through scripted shell transitions. State machine: IDLE / RUNNING / PAUSED / RESUMING.

**ShellBeat** — One leg of the tour script: entry/exit waypoints, time-in-shell, internal motion, overlay copy.

**TourScript** — Array of `ShellBeat`s. The tour's data structure.

**impostor** — A 2D billboard that approximates a 3D object. Used for the Milky Way disk and galaxy thumbnails.

**raymarch** — GPU technique for volumetric rendering: cast a ray through a 3D texture and sample at fixed steps.

**transfer function** — Mapping from a scalar field value (e.g. dark-matter density) to RGBA color.

**WGSL** — WebGPU Shading Language. Skymap's shader language.

**WESL** — WebGPU Shading Extended Language. Existing in-progress conversion from raw WGSL with cleaner module imports.

**render-on-demand (ROD)** — Skymap pattern: don't render every frame; only render when something changed. The cosmic zoom is one of those things.

## Data sources (referenced shorthands)

**SDSS** — Sloan Digital Sky Survey. Largest galaxy redshift survey. Existing skymap data.

**2MRS** — 2MASS Redshift Survey. All-sky redshift catalog from 2MASS infrared. Existing skymap data.

**GLADE** — Galaxy List for the Advanced Detector Era. ~2 M galaxies. Existing skymap data.

**NED** — NASA/IPAC Extragalactic Database. Source of the Local Volume Catalog used by shell 4.

**Gaia** — ESA stellar astrometry mission. DR3 is the current data release. Source of stellar positions for shell 2.

**JPL Horizons / DE440** — NASA JPL ephemeris service. Source of Solar System body positions for shell 1.

**Tully 2GC** — 2-Group Catalog from Tully 2015. Galaxy group memberships. Used by shells 5 and 6.

**Abell / ACO / MCXC** — Three galaxy cluster catalogs. Combined and deduplicated for shells 6/7.

**Cosmicflows-4 / CF-4** — Tully+ 2023 peculiar-velocity catalog plus its derived dark-matter density and velocity reconstructions. Hero data of shell 7. **License: CC BY-NC.**

**ROSAT** — Past X-ray all-sky survey. Source of cluster X-ray properties (via MCXC) for the cluster halos in shell 6.

**Planck PR4 SMICA** — Latest Planck CMB data release, component-separated. Source of the CMB texture for shell 9.

**HEALPix** — Hierarchical equal-area pixelization of the sphere. Used by Planck data; skymap already has a port at `src/utils/math/healpix.ts`.

**HyperLEDA** — Galaxy database; used in skymap for orientation cross-matches. Not a primary source for cosmic zoom but referenced indirectly.

## Workflow

**ADR (Architecture Decision Record)** — A short doc explaining one key decision, the alternatives considered, and the trade-offs accepted. Lives in `decisions/`.

**MVP** — Minimum Viable Product. The reduced-scope version of the cosmic zoom defined in `implementation/01-mvp-definition.md`.

**Phase N** — A sequenced bundle of implementation work. Defined in `implementation/00-phasing.md`.

**Milestone Mn** — A demoable artifact at a checkpoint. Defined in `implementation/04-milestones.md`.
