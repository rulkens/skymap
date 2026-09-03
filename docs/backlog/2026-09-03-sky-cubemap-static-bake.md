# Sky cubemap: bake once per band entry, re-bake only on roster toggles

**Proposed:** 2026-09-03, during the S-star lensing investigation (PR #657,
closed). Independent of that item — doable on main today.

## Why the per-frame capture is dead weight

The capture roster (`ContentLayer.skyCapture`) is galaxy point sprites, textured
disks, and the Gaia stream (`star-catalog` + `star-aggregates`). `star-points`
carries the flag too but never draws in a capture: the face pose's placeholder
`distance: 1` trips its `FOREGROUND_MAX_DISTANCE_MPC` gate (see
`2026-09-03-s-star-analytic-lensing.md`). So everything that actually lands in
the cubemap is kpc away and static in time. A 1024² face covers 90°, so one
texel is ~1.5 mrad; shifting content at 8 kpc by a texel needs ~12 pc of camera
travel. The whole lens band is 500 AU. One capture is texel-exact for the entire
band, and the pinned eye is irrelevant because the lens shader already treats
the cubemap as at infinity.

The current scheduler (`skyCubemapCaptureSchedule.ts`) re-captures one face per
frame round-robin, sweeps all six on band entry or after 3% of GC-distance
camera drift (`SKY_CUBEMAP_RECAPTURE_CAMERA_MOVE_FRACTION` + the
`recaptureCameraMoveFraction` tuning knob), and tops up any face older than 2 s
(`SKY_CUBEMAP_RECAPTURE_THRESHOLD_MS`). None of that buys anything.

## Change

1. Capture all six faces when the band engages or the texture is (re)allocated
   (the resolution knob already reallocates). Otherwise capture nothing.
2. Re-bake when a roster layer's visibility toggles while in band: key on the
   handful of `settings.*` booleans the roster layers read (galaxy layer
   visibility, star-catalog enable, textured-disk enable) — a small signature
   compared per frame, full sweep on change.
3. Delete: the staleness valve, the camera-move fraction and its settings row +
   panel control, the per-frame round-robin and cross-frame touched-faces
   bookkeeping, and pinned-eye tracking in camera runtime. Keep the full-sweep
   path. `skyCubemapCaptureSchedule.ts` and its test shrink to a few lines.
   This consumes the two deletion-audit items parked at the #645 ship.
4. Remove `skyCapture` from `star-points` and say why in its comment: the flag
   is a no-op today and the S-star item wants them off the roster for good.
5. Before deleting, grep every remaining roster layer for live-camera reads in
   the capture path (`galaxyPointSpritesLayer` keys on eye position, not
   `cam.distance`): a capture output that depends on the camera has to lose
   that dependency, not keep the recapture.

## Measure

Paired A/B `npm run perf` on `sgr-a-star-lens`: in-band cost should drop by one
face render per frame. Outside the band nothing changes. The band-entry sweep
lands while the crossfade alpha is ~0, so no visible pop.

## Related

- `2026-09-03-s-star-analytic-lensing.md` — the S-star item; its follow-on
  section pointed here.
- `2026-09-02-lens-crossfade-duplicate-points.md` — about the ramp, unaffected.
- `2026-09-03-sky-cubemap-face-seams-star-aggregates.md` — same capture code.
