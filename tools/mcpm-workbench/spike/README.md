# MCPM tiling spike (throwaway)

Question: does a big MCPM volume split into tiles + margins reproduce the whole-box run?
Compares a 200 Mpc whole box (256³ at 0.78125 Mpc) against 2×2×2 tiles of 50 Mpc with
margins of 8/16/32 voxels, on the central 100 Mpc, with whole-box seed 2 as the noise floor.

```bash
# catalog: public/data/galaxy-catalog/v9/sdss-large.<hash>.bin (or fetch from R2 via the manifest)
npx tsx tools/mcpm-workbench/spike/runTiling.ts <sdss-large.bin> <outDir> 400 ref-s1 tile-m32 ref-s2 tile-m16
npx tsx tools/mcpm-workbench/spike/analyzeTiling.ts <outDir> <sdss-large.bin>
```

- default mode (`tilingPage.ts`): own minimal host over the unmodified kernels, VAC-pinned
  (VAC agent density, reroute threshold at 10M agents, VAC per-galaxy weight, whole-box seed spread)
- `TOOL=1` (`toolPage.ts`): the workbench's `createMcpmHarness` unchanged, per-box semantics,
  agents 3.2M whole box, 100k-quantised per tile
- `SWIFTSHADER=1`: CPU WebGPU for a GPU-less container (~0.1 µs per voxel-step); default is the real GPU
- outputs are cropped f32 cubes; a run whose output file exists is skipped, so reruns resume

Open question: VAC-pinned tiles at a 25 Mpc margin come out ~3.5% brighter overall (flat across
the tile, not at seams). Next run: the pinned values at the tool's agent density, to see whether
low agent density is the cause.
