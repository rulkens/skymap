# M74 / NGC 628 JWST-MIRI vs the analytic-field galaxy model

What the `milky-way-analytic-field` branch's modified-SSPSF renderer can and
cannot capture of the PHANGS MIRI image of M74 (2026-08-03). Written on main
because the branch worktree was in active use; belongs next to
`docs/research/milky-way/` once merged.

Numbered in reading order — evidence first, synthesis fifth, design last. In
a hurry: read 05, it links back into everything before it.

1. [01-image-morphology.md](01-image-morphology.md) — feature-by-feature read
   of the image itself (foam topology, rims, knots-on-walls, interarm
   structure).
2. [02-bubbles.md](02-bubbles.md) — superbubble physics; PHANGS-JWST NGC 628
   primaries (Watkins, Barnes, Thilker, Egorov) fetched and verified.
3. [03-clouds-and-dust.md](03-clouds-and-dust.md) — GMC formation/lifecycle,
   decorrelation, N-PDFs, what PAH emission actually traces.
4. [04-supernovae.md](04-supernovae.md) — SNR populations, trigger-less
   holes, dust destruction, the SSPSF lineage vs TIGRESS.
5. [05-renderer-gaps.md](05-renderer-gaps.md) — **the synthesis**: ranked
   gaps, direct answers on bubbles / cloud regions / supernovae, and what
   the design already gets right.
6. [06-ca-dust-channel-sketch.md](06-ca-dust-channel-sketch.md) — design
   sketch: a conserved dust channel + snowplough rule implementing
   rims/walls/floors in the CA (free channel slot, one rule, five
   landmines).
7. [07-sprite-seeding.md](07-sprite-seeding.md) — why the map-seeded dust
   sprites lose high frequencies (5 mechanisms) and a perf-neutral seeding
   redesign (inverse-CDF placement, streamline children, map-modulated
   size/aspect, fragment-side map detail, 3D lift, orientation-tensor
   verdict).
8. [08-realism-notes.md](08-realism-notes.md) — beyond the foam: asymmetry,
   bar dust lanes, across-arm age sequence, scattering floor, DIG, chromatic
   arm contrast, instrument signature, and a statistics-based tuning
   harness — with implementation hints and a priority table.
9. [09-fluid-pivot-literature.md](09-fluid-pivot-literature.md) — after the
   CA's structural verdict: the advected-density direction, a verified
   prior-art negative, face-on visual ground truth (Zhao/SILCC/TIGRESS),
   and the Latte/FIRE pipeline findings (offline; the field is the gap,
   not the renderer).

Every claim is labelled LITERATURE-verified / SECONDARY / RECALLED per the
branch's research-doc convention; docs 02–04 were produced by research
subagents and the labels are theirs — spot-check before promoting any single
number into code.
