# `npm run shot` intermittently fails to settle

**Seen:** three times on 2026-10-05 to 2026-10-07 while developing the GPU
star cut (PR #856), each on `:5174` with `--timeout 20`, each clean on an
immediate rerun.

## Symptoms

- A shot at the `milky-way` perf pose hung.
- A shot came back all white with "did not settle" right after a large edit.
- A shot at the `milky-way` pose printed "did not settle within 20 s" and
  differed from its baseline by up to 80/255; the rerun differed by 1/255.

## What is and is not known

- Not reproduced on demand: 14 consecutive repeats were clean.
- Two of the three followed source edits, so a Vite dependency re-optimise or
  an HMR reload mid-boot is the first suspect. Unproven.
- Not shown to be specific to that branch; no run on main was attempted.

## First steps

1. Have the shot tool print console warnings as well as errors on a failed
   settle (WebGPU validation errors arrive as warnings), and whether a full
   page reload happened during the wait.
2. Loop the `milky-way` pose 50 times against an untouched dev server, then
   again while touching a source file, to separate the HMR cause from a
   settle-detection one.
