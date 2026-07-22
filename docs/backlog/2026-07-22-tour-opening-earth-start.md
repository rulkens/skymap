# Tour opening retune for the Earth-home boot

**Surfaced:** 2026-07-22, during the Earth-home spec (`specs/2026-07-22-earth-home-sunlit-boot-design.md`).

## Problem

The grand tour's opening beat (`src/data/animation/tours/grandTour/openingTitle.ts`) and closing beat (`homeAgain.ts`) were choreographed when the app booted at the Milky Way framing: both `aimAt` the galactic-disc bearing (`GALACTIC_DISC_YAW_RAD`/`GALACTIC_DISC_PITCH_RAD`, `cameraFraming.ts`), and the opening assumed the camera was already sitting at `INITIAL_DISTANCE_MPC` inside the Local Group.

With boot-as-home the session starts at Earth (~2e-16 Mpc framing, sunlit side, focus pinned). Starting the tour from there means:

- The opening's first `aimAt` swings the camera to the disc bearing from an Earth-scale pose — the transition was never designed or eye-tuned for that start.
- Narratively, "The Long Way Out" starting *at Earth* is arguably a better fit than starting mid-Local-Group — the retune is an opportunity, not just a fix.

## Options

1. Prepend a short Earth-departure clip to `openingTitle` (Earth recedes, then the existing aim/zoom choreography takes over).
2. Have the tour runner fly to the old boot pose first (restore the previous invariant, minimal choreography change).
3. Re-choreograph the opening beat around the Earth start properly (most work, best result).

## Notes

- `homeAgain` (the closing beat) may also want to land at the Earth home pose instead of the disc bearing, mirroring the boot state — decide together with the opening.
- Tune with `npm run tour-length` for beat timings; visual pass required either way.
