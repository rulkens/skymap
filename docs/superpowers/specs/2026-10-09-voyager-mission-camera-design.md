# Voyager mission camera — design

**Status:** rulings from the user 2026-10-08/09 (asks qcfJ, 6X4A, zEJP, oFnb; previews `leg-preview`, mode D chosen, "just build it"). Rides on PR #854. Supersedes the ride-along spec's ride camera and ride clock ([`2026-10-07-voyager-flyby-ride-along-design.md`](2026-10-07-voyager-flyby-ride-along-design.md)): the ride folds into one mission camera and one mission clock.

## Goal

The camera follows the selected craft through the whole mission, framing the action: the craft and the planet it is heading for, closing in on each approach and flyby. The timeline gives every leg the same width, and playing gives every leg about the same wall time, slowing where the action is.

## Behaviour

- **Entry.** The exhibit opens paused at the selected craft's launch, the camera close on Earth with the craft leaving.
- **Legs.** A leg runs from one stop to the next; the last runs to now. Events less than a day apart merge into one stop (Voyager 1's Titan and Saturn: one stop, two dots).
- **Timeline axis.** Equal width per leg. Dots still step. The scrub range is the selected craft's launch to now, so dragging to the left end lands on Launch; there is no "not launched" state. No era labels; the first and last labels are the launch year and "now".
- **Camera (mission camera, mode D).** Each frame:
  - *ahead* = the craft plus the planet of the next stop, or the Sun when the next stop has no planet (heliosphere legs);
  - *behind* = the craft plus the planet of the stop just passed (Earth for the launch stop);
  - the frame is *behind* from a stop until `MISSION_FLYBY_LEAD_DAYS` (2 d) after its closest approach, then *ahead*: a hard switch in sim time. Before a stop's planet frame closes, the radius never falls under 3 × that encounter's closest-approach distance.
  - View direction: the flyby-plane normal (the ride's side view) near a planet, the exhibit's base direction in cruise, switched on the frame radius with hysteresis (to cruise above 0.5 AU, back to near below 0.05 AU), so it cannot flap.
  - Every view change (a step, a craft tab, a switch of framed stop or of view direction) eases from the camera as shown to the live frame over `MISSION_EASE_MS` (3 s) of **wall** time, smoothstep in-out, whatever the clock speed; a paused clock still finishes it. The target travels in step with the log-distance blend (out wide before it pans, in after), and the distance never falls under the craft's fit about the eased centre, so the craft stays in view (a step, which jumps the clock, fades that floor in instead of snapping out). Scrubbing across a switch eases from wherever the camera is at each crossing; nothing flaps.
  - The visitor's orbit and zoom are offsets inside the frame that persist through steps, tabs and hand-offs; after `MISSION_EASE_MS` without input they ease back to the auto view over another `MISSION_EASE_MS`, and a new input cancels that.
- **Clock (mission profile).** ▶ builds a wall→sim profile from the current instant to now and plays it: each leg takes `MISSION_LEG_WALL_MS` (6 s) at 1×, and near a planet the sim speed is capped so the frame shrinks no faster than it can be followed (sim speed ≤ k × frame diameter / craft–target relative speed, the ride's rule). Leaving a cap the speed grows at most e-fold per `MISSION_RAMP_MS` (0.5 s), so it never leaps mid-ease. − / + step a speed factor (¼×, ½×, 1×, 2×, 4×) and rebuild the profile from the current instant. The rate slot shows the profile's current sim speed. Pause, scrub, a `t=` link, or any non-exhibit time action ends the profile at the current instant (today's rule).
- **Steps.** Previous / Next / dots: to a flyby → clock at closest − 2 d and play; to any other event → clock at the event instant, paused.
- **Craft tabs.** Switching keeps the instant, clamped up to that craft's launch; the camera frames the new craft.
- **Dropped:** the ride camera driver and ride profile as separate concepts, the `Whole mission` control, the riding line on the card, the era labels.
- **Exit** restores clock and focus as today.

## Ground preparation

The ride already is a per-frame follow driver (`ride`, `followsMovingTarget`) with a wall→sim profile on the clock (`TimeState.profile`, `deriveSimDays`). Those joints carry this feature: the driver generalises from "one flyby" to "the mission", and the profile from "±2 d of one flyby" to "here to now". No new joint is needed; the change is a rename-and-widen of the ride units (`CameraRide` → `CameraMission`, `buildRideProfile` → `buildMissionProfile`, `ridePose` → `missionPose`), not a sibling beside them.

## Testing

- `missionFrame(craft, t)`: contains the craft at every instant across ±30 d of every stop of both craft (sampled hourly near stops); continuous on each framed stop (no jump larger than a small fraction of the radius between adjacent samples); the switch between stops is the camera's to ease.
- `missionPose`: the craft stays in view, with no frame moving the view by more than a tenth, through the post-flyby switch at 4×; offsets hold for the idle wait, then ease back; a new input cancels the ease back.
- `buildMissionProfile`: monotone; each leg's wall time ≈ `MISSION_LEG_WALL_MS` / factor except where the near-planet cap slows it; ends at now.
- Equal-leg axis: `fraction(instant)` and `instant(fraction)` invert each other; merged stops share one boundary; clamp at launch.
- Saga: entry → paused at launch with the mission camera on; flyby step → closest − 2 d, playing; non-flyby step → event instant, paused; tab switch clamps to launch.
- Visual check (dash): opening at Earth, Neptune approach and flyby, a heliosphere leg.
