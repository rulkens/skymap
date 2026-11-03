# turnCameraArm reads the site tag by hand

**Why.** Frame-tag spelling is read in one place, `src/services/engine/camera/rungs/`, and
`oneTagReader.test.ts` bans branches on it elsewhere. `tools/site/utils/turnCameraArm.ts:7`
tests `'site' in arm.frame` directly, so a change to the tag's shape (the sky rung's value
becomes an object) would be missed here.

**Fix.** Route the check through `isSiteArm(arm)` (`rungs/isSiteArm.ts`), which narrows to
`FramedPose<'site'>`. The `'headingRad' in arm.pose` test then goes too. `tools/` is outside
the ratchet's scan, which is how this slipped past it.
