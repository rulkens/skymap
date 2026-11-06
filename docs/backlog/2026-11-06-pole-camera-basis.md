# A camera looking along a body's pole has no up vector

`needs-design` · found by the sky look-around final review (L1), 2026-11-06

## Problem

When the view direction is parallel to the body's pole, `imagePlaneBasis` (through
`rollFromScreenUp`, which documents the degeneracy) takes `forward × pole = 0` and returns a zero
screen-up. `decodeBodyFixedChannels.ts` and `toBodyFixedChannels.ts` then build a body pose with a
zero up column, so the view matrix is degenerate.

The sky exit's lift reaches it: at a spot exactly on a pole, `#pose=k,earth,<lon>,1.5707963267948966,…`,
the climb leg looks straight down the pole and screen-up is `(0, 0, 0)` from the climb's start
through the committed body-arm pose. Before the sky look-around branch, the roll-0 decode had the
same degeneracy, but no user input reached it. Today only a hand-written link does; sky mode's
"Sky from here" entry (backlog: Sky mode, the rest) would make arbitrary spots, poles included,
reachable.

## Options

- Fall back to a fixed horizontal reference in `imagePlaneBasis` when `|forward × upRef| ≈ 0`,
  with a matching change in `rollFromScreenUp` so a roll round-trips. It is shared with the
  renderer, so every caller gets a heading jump at the threshold. Needs a shared util and tests.
  The review fix round judged it well over ~10 lines.
- Carry the heading through the degenerate frames (the clip's last good screen-up), so only clip
  evaluation needs to know.
- Do not clamp latitude in the `k` link decoder: it hides the case instead of fixing the basis.
