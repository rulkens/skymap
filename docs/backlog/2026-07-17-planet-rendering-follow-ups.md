# Planet-rendering follow-ups (final-review Minor triage, 2026-07-17)

Small knots from the planet-rendering final whole-branch review — none
merge-blocking, all next-touch material. Evidence lives in the feature PR's
review record.

1. **Saturn pole dual-source** — `orbitPlaneFrames.ts:82` and
   `rotationElements.ts:81` author the same IAU pole as two literals, pinned by
   a parity test rather than derived. Defensible (Mars/Jupiter frames use
   deliberately rounded independent poles); derive Saturn's frame from
   `rotationById('saturn')` if either site is next touched.
2. **@types runtime type-shape tests** — a few Plan 01 tests assert type shapes
   at runtime; judge against `testing.md` ("will it fail on a real bug?") and
   delete the ones that can't.
3. **`UNIFORM_BUFFER_SIZE = 96` hardcode** — the textured-body uniform byte size
   is restated beside the packer's own length; derive one from the other.
4. **Stale plan-reference comment** — `bodyTextureSlotRegistry.ts:100-101` still
   says "route in Task 8" (a plan-execution artifact); reword timelessly on next
   touch (`feedback_comment_style`).

Related, already indexed separately: "Tier-ladder single home".
