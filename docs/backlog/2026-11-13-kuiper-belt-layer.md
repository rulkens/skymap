# Kuiper belt Layer

## Why

The owner wants the Kuiper belt in the scene: the centaurs, the scattered disk and the objects beyond
Neptune, MPC orbit type 10 (1,248 numbered rows in the 2026-11-11 MPCORB). The asteroids Layer had them
as a fifth class, `distant`, and dropped it by owner ruling on 2026-11-13. The bake now writes type-10
rows as ABSENT, without their names (`tools/asteroids/asteroidClassFromOrbitType.ts`).

## What to reuse

The asteroids' data pipeline (the MPCORB parse in `tools/asteroids/`, the `.astb` format in
`src/data/asteroids/asteroidFormat.ts`) and its renderer (the GPU Kepler compute with compaction and the
indirect dot draw in `src/layers/asteroids/kepler/` and `points/`), "but designed a bit better" (owner).

## Open design questions

- **Sharing without a cross-Layer import.** Two Layers want the Kepler compute and the dot renderer.
  Extract them to a shared home (under `src/services/gpu/` or similar) that both Layers instantiate, or
  give each Layer its own copy? The Layer contract does not grow without a yes.
- **Where the centaurs belong.** Between Jupiter and Neptune, type 10 lumps them with the TNOs; they
  could also be their own class or stay out.
- **Lift and fade.** Read the reverted commits `9160f9d89` (per-class fade, distant full ≤400 AU, gone
  by 1,500 AU, asset load/evict at 2,250/3,750 AU) and `39d55f5cc` (per-class lift cap). Under the belt's
  12 AU lift cap a TNO seen from 400 AU sat ~6 mag too faint and no dot drew; a cap near 600 AU zoom
  brought the ring back. The Kuiper belt wants to be full to ~400 AU and gone by ~1,500 AU.
- **Dwarf planets that are already meshes.** Pluto (134340) is a body; check Eris, Makemake, Haumea,
  Sedna and others against the body list, and keep a skip list as the asteroids do
  (`src/layers/asteroids/catalog/data/meshAsteroidNumbers.ts`).
