# Sun trail gap beside the craft just after launch

**Readiness:** `needs-verification`.

In normal mode (`missionTrails.nearPlanets` off), just after Voyager 1's launch, about 4,000 km of its Sun-centred trail
next to the craft is not drawn; the rest of the streak shows. Seen after PR #1163.

Repro link:
`#t=1977-09-05T13:20:00Z&pose=b,earth,0,0,0,40000000,0,0,0,1,0,0,0,1,1,0,0&layers=missionTrails`

Cause not found. One untested guess: the straight Sun-frame line dips under Earth's occluder sphere there
(`src/services/gpu/shaders/lib/trailOcclusion.wesl`, read by core's `shaders/bodies/sampledTrail/fragment.wesl`). Confirm or rule that out first.
