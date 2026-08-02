# Approach fade

## The approach fade never fires at the galactic centre

**MEASURED.** `SCALE_FADE_BANDS.milkyWayApproach = { fullAt: 0.002, goneAt: 0.0002 }` — 2 kpc to
200 pc (`scaleFadeBands.ts:77`) — is evaluated against
`Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2])`
(`milkyWayCloudLiveness.ts:72`), the camera's distance from the **heliocentric render origin**,
i.e. from the **Sun**. Its own comment says what it was tuned for: the camera diving into the
disc _toward the Sun_.

Standing at the galactic centre you are R₀ from the Sun — **4x beyond `fullAt`** — so the band
returns exactly 1.0. **MEASURED** along the Sun→GC line, the composed alpha (approach ×
apparent-size × toggle) is **1.000 at 1 kpc, 100 pc, 1 pc and 10 milliparsecs from Sgr A\***. The
fade is not being overwhelmed by exposure; it never starts. You sit at full brightness inside the
densest part of the cloud with nothing in the pipeline able to turn it down.

**MEASURED, R₀ is a third disagreeing number.** The code constant is `SGR_A_DIST_MPC = 0.008`
(`galacticCenter.ts:46`) = **8.0 kpc**; its own docblock cites GRAVITY 2019's 8.178 ± 0.013 kpc;
BH&G 2016 gives 8.20 ± 0.1 kpc. Everything downstream of the fade uses 8.0.

**Why it went unnoticed:** the band was eye-tuned against **one** approach (the descent to the
Sun), and every Milky Way pipeline change since — including the half-res split, #521 — was
visually validated against that same approach. The GC is a second approach no gate had ever been
checked against.

**Ruled out, with evidence — do not re-chase:** the half-res split is energy-neutral
(`stars.wesl` conserves flux across the px clamp in both directions, `clampFluxScale = invK*invK`);
the fade math is byte-identical across the #521 merge; `starCount` decoupling from tier does not
bite at boot.

## The fade braids two jobs

**INFERRED (design analysis).** `milkyWayApproach` is doing two things at once:

1. A **Gaia handoff** — correctly Sun-anchored, because that is where the star catalog takes
   over. Present, calibrated, working.
2. An **immersion** term — how deep inside the sprite field the camera is. **Absent**, and the
   cause of the GC bug described [above](approach-fade.md#the-approach-fade-never-fires-at-the-galactic-centre).

Braided together, they cannot both be right. A fix shape that has been discussed but **not
implemented**: key the band on distance to the nearest `BODY_REGIONS` anchor rather than the
origin. Near the Sun the nearest anchor _is_ the Sun, so today's calibration reproduces
bit-for-bit; at the GC it becomes Sgr A\*.

**Rejected, with the reason recorded so it is not re-proposed:** plane distance `|z|`. It fails
for the edge-on-from-outside view, where `|z| ≈ 0` at 100 kpc would blank the galaxy entirely.

**Open, and the fix does not answer it:** 200 pc is the right handoff to Gaia near the Sun, but
at the GC nothing replaces the impostor there — the S-stars are milliparsec-scale and Gaia's
bulge coverage is heavily extincted. The band edges likely want to be per-region.

**USER DECISION 2026-07-31:** do not fix this inside the S-star branch. It lands in its own PR
once the Milky Way rendering itself is sorted.
