# Self-shadowing for mesh bodies

**Why.** `meshBody/fragment.wesl` has no shadow term: a sunward-facing slope on the night side
is lit. On Bennu (`#focus=body-bennu&t=2026-10-20T00:00:00Z`) a white patch sits well past the
terminator. A tint probe (2026-11-02, PR #986) showed it is front-facing geometry with
n·L > 0.1, not a normal-map leak, so a terminator fade does not remove it.

**Open.** Whether it is a real peak catching light (as lunar peaks do) or a slope the body
should shade; a shadow map or a baked horizon/visibility term would settle it. Affects every
mesh body (Phobos, Vesta, Ceres, the craft).
