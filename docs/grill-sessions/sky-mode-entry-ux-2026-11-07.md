# Grill Session: Sky mode entry and HUD — 2026-11-07

Source: chat, starting from the question "how do we make sure a user can actually enter sky mode?",
against the draft spec `docs/superpowers/specs/2026-10-28-sky-mode-design.md` (branch `sky-mode`) and
the shipped look-around arm (#1059, #1077).

Today only clips and a hand-made `#pose=k,…` link put the camera in the `{ sky }` arm. This session
settled how a person finds sky mode, gets in, knows they are in it, gets out, and how search behaves
while standing. Mockups were injected into the real app and shot at Søndermarken by night and over
Copenhagen from 100 km and 30 km.

---

## Q1: A visible way in

**The question:** The draft spec's entry is a "Sky from here" palette row and the `s` key. A phone
has no `s`, and a desktop user finds the row only by typing into search. What visible affordance
lets someone discover sky mode?

**Considerations:**
- **Option A (contextual button near ground):** appears only when there is terrain under the view
  centre. Works on touch, found without being told. Costs an engine-pushed availability flag.
- **Option B (button on the Earth/Mars InfoCard):** only reachable once the planet is selected.
- **Option C (wheel push into the floor):** mirrors the shipped exit, but reversed ruling R6.
- **Option D (palette + `s` only):** the spec as written; invisible on phones.

**Decision:** A and C together. The owner wanted both the button and the push, and asked what R6
was (Q2).

## Q2: Amend R6 — zooming in at the floor enters

**The question:** R6 (2026-10-28) said "zooming back in never re-enters; the command does", guarding
against a loop where a lift-off followed by a little scroll-in drops you straight back down. D3
adds that no distance band ever enters sky mode by accident. Can a floor push coexist with that?

**Considerations:**
- **Amend:** a wheel-in the surface floor (`surfaceFloorM`, ~15 m on Earth) ate whole, from a fresh
  scroll (`SKY_EXIT_PAUSE_MS` = 250 ms of quiet, the exit's own guard), enters. The lift lands at
  `SKY_EXIT_ALTITUDE_M` = 100 m, so re-entry needs scrolling through 85 m, stopping at the floor and
  pushing again; a trackpad momentum tail does nothing. Cost: someone parked at the floor looking at
  terrain who scrolls in again ends up on the ground.
- **Keep R6:** the button is the only pointer entry.

**Decision:** Amend R6. Symmetric with the exit; the guard and the 85 m gap block the loop. D3 still
holds: no band enters, only a deliberate gesture.

## Q3: Which ground point you stand on

**The question:** At the floor, often looking obliquely, the cursor point, the view centre and the
point straight below can be hundreds of metres apart. Which one does each entry use?

**Considerations:**
- **Option A:** push → the cursor point (the wheel's existing anchor, `anchoredZoomStep`, ruling #7);
  button and `s` → the view centre. No sideways jump at the last notch.
- **Option B:** always the view centre (one rule, but the push jumps sideways).
- **Option C:** always straight below the eye.

**Decision:** A. The push finishes the zoom you were making; the button has no cursor.

## Q4: When the button shows

**The question:** Show it at any altitude (a dive from orbit), only below a ceiling, or only when the
planet is selected?

**Considerations:**
- **Any altitude:** found from orbit; the spec's arrival tween already covers the distance.
- **Below a ceiling:** the centre pick is precise and the dive short. Candidates 100 km (edge of
  space), 500 km, 20 km.
- **Only when selected:** hidden for most users.

**Decision:** Below 20 km (the owner: "should show when much closer to the earth"), picking 20 km
over the recommended 100 km. Terrain hosts only (R4: Earth and Mars today).

## Q5: Where the button sits, and the preview

**The question:** Top bar beside Home/Auto-rotate/About, or bottom centre? And how does a person
know which point they will stand on?

**Considerations:**
- **Top bar (mockup E):** with the existing controls, far from the sky HUD's exit.
- **Bottom centre (mockup F):** the spot the sky HUD's compass and Leave take over, so the way in and
  the way out share a place.
- **Preview:** the owner proposed a hover preview of the point.

**Decision:** Bottom centre. Hovering (or focusing) the button shows a ring at the view centre with
the place and coordinates beside it (mockup `g1-entry-hover`, passed).

## Q6: The preview on a phone

**The question:** A finger cannot hover; the first touch is the click. How does a phone user see
the spot?

**Considerations:**
- **1. Ring always on below 20 km:** the hover preview minus the hover.
- **2. Tap to preview, tap again to enter:** a phone-only step nobody expects.
- **3. Press and hold previews, release enters:** fast once known, invisible until then.
- **4. Place name in the button label, no ring:** calmest screen; says where in words, does not
  show the spot.

**Decision:** 4. Desktop keeps the hover ring.

## Q7: Where place names come from

**The question:** The preview label, the phone button and the sky-HUD title all need a name. Nothing
in the app turns a point into a name; `EARTH_PLACES` (`src/data/palette/earthPlaces.ts`) holds 26
hand-picked search points.

**Considerations:**
- **Coordinates only:** always right, no data.
- **Nearest `EARTH_PLACES` within ~25 km, else coordinates:** no new data; covers the EOX high-res
  regions where people mostly go.
- **A baked gazetteer** (GeoNames cities for Earth, IAU nomenclature for Mars): names everywhere,
  but a new data pipeline and download.
- **An online geocoder:** an outside request; breaks the offline kiosk. Ruled out.

**Decision:** Nearest `EARTH_PLACES` within ~25 km, else coordinates. The gazetteer is a backlog
follow-up.

## Q8: Showing that you are in sky mode

**The question:** What makes the mode unmistakable from a screenshot alone (ui-ux Interaction 1)?

**Considerations:** four directions shot in the real UI:
- **A, mode chip** under the search bar: place, coordinates, Lift off, Leave.
- **B, horizon compass** at the bottom: place title, compass ribbon with cardinal points and a caret,
  heading and altitude readout.
- **C, takeover cluster:** deep-space panels hidden, a centred title and round buttons.
- **D, the search bar carries the mode.**

All four swap the scale bar (meaningless at ground level) for a heading/altitude/field readout and
the Navigation panel's rows for the sky gestures.

**Decision:** B, with the exit controls at the bottom too (the owner: "B is a cool start, but the
buttons to leave should be located on the bottom"), as a row under the readout (mockup B2).

## Q9: Lift off and Leave — two exits?

**The question:** The owner asked whether Lift off and Leave are the same thing.

**Considerations:** they land in different places: Leave (Esc, spec D2) restores the camera captured
at entry, Lift off (`skyExitLift`) rises to 100 m above the spot looking down. They differ only when
you entered from far away. Two buttons break "one way to do a thing" (ui-ux Interaction 7).
- **Leave only;** lift off stays the wheel-out gesture.
- **Lift off only;** Esc still restores.
- **Both.**

**Decision:** Leave (Esc) is the one button; lift off stays a gesture, listed in the Navigation
panel.

## Q10: Search while standing

**The question:** A palette `focus` action today runs `requestFocus` and flies the camera; the draft
spec (§4.3) ends sky mode on a focus change. What should picking a result do while standing?

**Considerations:**
- **Turn to face it;** the card's Focus/`F` flies (recommended): "where is Saturn" means where to look.
- **Turn to face it and zoom the lens to frame it.**
- **Leave sky mode and fly there** (the spec as written).

**Decision:** Turn and frame. A place pick (`flyTo` row) re-enters at that place (spec §4.2 step 4).

## Q11: The framing rule

**The question:** How much does the lens zoom? Lens range 0.5°–120° (`skyZoomedLens`); stars have
no angular size.

**Considerations:** frame by angular size (lens ≈ 3 × diameter): M31 ~3° → ~9°, Moon → ~1.5°,
Saturn → clamps to 0.5° with rings visible. A star would clamp to 0.5°, a lone dot.
- **Frame things with a size; stars keep the lens.**
- **Frame everything.**
- **One fixed zoom.**

**Decision:** Frame things with a size; stars zoom in a little and keep context (owner note).
The exact star rule is the designer's call (recorded in the spec).

## Q12: Entering by day

**The question:** Sky mode keeps the sim clock (D2), so a click at 14:00 shows a blue sky with no
stars — likely most people's first impression.

**Considerations:**
- **Offer "Skip to tonight" in the HUD** while the sun is up at the spot (`enterManualPausedAt`, undo
  via the Time bar's "Now").
- **Jump the clock on entry:** surprises anyone who set the time on purpose.
- **Nothing.**

**Decision:** Offer "Skip to tonight".

## Q13: Esc with a card open

**The question:** `escape` runs `[clearSelection(), exitTakeover()]`. Search now selects, so closing
a card with Esc would also leave sky mode.

**Considerations:** ui-ux Interaction 8: Escape closes the innermost open thing.
- **First Esc closes the card, second leaves.** Also fixes the same trap in tours and exhibits.
- **One Esc does both** (today).

**Decision:** First Esc closes the card, second leaves.

## Q14: A search result below the horizon

**The question:** Saturn at noon, or the Southern Cross from Copenhagen: nothing to frame.

**Considerations:**
- **Face its rise direction, offer "Skip to when it rises"** — the same pattern as Q12; objects that
  never rise from the spot get a card line and no offer.
- **Face its direction, card says below the horizon.**
- **Leave sky mode and fly to it.**

**Decision:** Face the rise direction and offer "Skip to when it rises".

## Q15: Mockup tooling

**The question:** The mockups were made by a scratch Playwright script (~30 s per shot, mostly app
boot). Is a faster loop worth building?

**Considerations:** `--inject <file>` on `npm run shot` (smallest), or a dev-only `?mock=<name>` React
mount loaded through Vite plus a long-lived `npm run mock` re-shooter (about a second per iteration,
real components and tokens, still the real UI).

**Decision:** The `?mock=` mount and `npm run mock` driver, built now as its own PR.

## Process notes

- The owner asked for designs "shot in the actual UI"; DOM injection into the real app was the right
  medium and is what the tooling in Q15 makes fast.
- The stale `origin/sky-mode` branch (21 commits, 2026-11-01) will be salvaged for its sky-grid and
  lat/lon utils into the new spec's ground preparation, then deleted.
