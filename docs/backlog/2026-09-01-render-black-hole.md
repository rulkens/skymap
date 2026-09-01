# Render Sgr A* — black-hole close-up

`blocked` on the body-slab work (riding the Earth RTC camera effort, PR #634 line). Design is fully settled — see the grill transcript, don't re-litigate without new evidence: [docs/grill-sessions/render-black-hole-2026-09-01.md](../grill-sessions/render-black-hole-2026-09-01.md).

One-paragraph shape: environment-cubemap geodesic screen pass (Schwarzschild, 1D deflection LUT), faint EHT-style in-pass glow (annulus 3–6 r_s, doppler, minimal sim-clock flicker), "sky" content lensed / annotations on top, far-field orange glint crossfading in via a `SCALE_FADE_BANDS` row on the Sgr A* anchor (~500→100 AU), amortized round-robin cubemap capture, zero user settings, descent floored at ~2 r_s via per-body standoff override.

Resume: probe precision/gates at 2 r_s under the new slab → `refactor-ground` (fold in `2026-07-30-camera-target-vs-origin-distance-gates.md` if implicated) → spec from the transcript.
