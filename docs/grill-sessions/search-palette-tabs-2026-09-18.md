# Grill Session: Search palette tabs — 2026-09-18

Source: conversation (user ask: "extend the 3×5 famous-galaxy overview with tabs to cover the breadth of skymap").

The Cmd+K palette's empty state shows only 15 famous galaxies, so visitors can't discover what else skymap holds (planets, moons, stars, Sgr A* and the S-stars, spacecraft, rovers, large-scale structure, tours). Goal: a tabbed, image-led browse surface that shows the whole range while search stays as it is.

Starting point (code survey): `src/components/CommandPalette/` renders `FeaturedGrid` (15 hard-coded `FEATURED_IDS` in `utils/resolveFeaturedEntries.ts`, thumbnails from `public/images/famous/<id>.webp`) above `ResultsList`. Search ranks five row kinds (`famous`, `alias`, `structure`, `milkyWay`, `body`), and every selection resolves to a durable `#focus=<id>` handed to `requestFocus`. Only galaxies have images. Tours and clips (`src/data/animation/{tours,clips}`) have no entry point in the palette.

---

## Q1: Where do the tabs live, and what does typing do to them?

**The question:** Are tabs a browse surface inside the palette, a filter on search, or a separate panel?

**Considerations:**
- **Option A (tabs replace the empty-state grid):** Browsing and searching stay separate: tabs for discovery, search stays global. The smallest change, and Cmd+K stays the one entry point.
- **Option B (tabs scope the search):** Useful for someone who knows what they're after, but hides results ("where's M31? I'm on Solar System") and needs a tab mapping for every row kind in the ranker.
- **Option C (separate Explore panel):** Easier for newcomers to find, but a second surface that duplicates the card rendering.

**Decision:** A, as the user phrased it: the tab strip sits above the featured grid, each tab shows its own image grid, and all of it shows only while the query is empty. Typing switches to the global results list as it does today.

## Q2: Where do the new images come from?

**The question:** Only galaxies have thumbnails. What do planets, spacecraft, structures, views and tours show?

**Considerations:**
- **Option A (skymap renders its own):** A build-time script opens each card's target headlessly and saves a webp. It shows what the click actually gives you, one look, and can be re-run when rendering improves. Cost: a small tool. Some targets (voids) may not look good as a single still.
- **Option B (real photos, hand-picked):** Look good straight away, but each needs picking and crediting by hand, and the thumbnail won't match what skymap shows after the click.
- **Option C (mixed):** The best-looking image for each item, but two pipelines and two visual styles in one grid.

**Decision:** A. One pipeline, one consistent look, and no thumbnail that promises something the render doesn't deliver. A card that looks bad gets a better camera, not a second image source. The Galaxies tab keeps its existing `famous/` images: they are the images skymap draws on close approach, so they already match the result.

## Q3: Which tabs?

**The question:** What set of tabs covers skymap's range without overlapping?

**Considerations:**
- The proposed set, each mapped to data that already exists: Highlights (curated, every scale), Solar System (Sun, planets, major moons), Missions (Hubble, Voyagers, rovers), Milky Way (Milky Way, named stars, Sgr A*, S-stars), Galaxies (today's 15), Deep Space (Local Group, Virgo, Laniakea, Coma, Shapley…).
- "Deep space" split in two: a single tab of 15 galaxies plus 15 structures would be too long, and "a galaxy" versus "the structure it sits in" are different ideas.
- Left out: surface sites (they fit under Solar System and Missions) and constellations (no focus target yet; backlog item exists).

**Decision:** The six tabs above, plus Tours (Q4). The whale and petunias are jokes rather than missions and aren't in Missions. After Q5 they appear in no tab (still reachable by search).

## Q4: Do tours and clips belong in the grid?

**The question:** The grand tour, showcase tours and clips can't be found today. Should the palette offer them, given that a tour card *plays* something instead of *flying to* a place?

**Considerations:**
- **Option A (a Tours tab):** The best way to show everything skymap can do. It adds a second kind of card action, so the action must be one lookup table, not scattered `if` checks.
- **Option B (palette is places-only; tours get their own entry point):** One action, but another entry point nobody finds.
- **Option C (one grand-tour card in Highlights):** Cheapest, but the other clips stay hidden.

**Decision:** A, with a hand-picked list of tours and clips worth showing a visitor, not the whole clip registry (some clips are dev fixtures).

## Q5: What goes in Highlights, and in what order?

**The question:** "Items across all scales and rungs": which ones, and in what order?

**Considerations:**
- Draft: 15 cards ordered smallest to largest, with a scale label per card (Perseverance ~3 m → Laniakea 10²⁴ m), plus a whale/petunias surprise and a grand-tour card.
- Order: smallest to largest (reading the grid is a trip outward) versus crowd-pleasers first.
- A scale label on each card is what makes it read as a ladder rather than a random mix.

**Decision:** Order smallest to largest, with scale labels. Changes from the draft: no tour card, no whale/petunias, Boötes Void dropped ("not that interesting"), a **cosmic web** card added, and the last card is **the full view of the universe**. Final list: Perseverance, Hubble, Earth, Saturn, the Sun, Voyager 1, S-stars around Sgr A*, the Milky Way, Andromeda, Local Group, Virgo Cluster, Laniakea, cosmic web, the universe.

## Q6: How does a card send you to a view instead of an object?

**The question:** "Cosmic web" and "the universe" aren't focus targets. The URL hash only encodes focus ids (`body-*`, `star-*`, `pgc-*`, structure ids, `milkyWay`).

**Considerations:**
- **Option A (a `view` action: a named camera preset, anchor + distance + angle):** Exactly what the cards mean, and the capture script needs a fixed camera per card anyway, so the preset does both jobs. Cost: a new action type. A `#view=<id>` deep link would be a natural follow-up.
- **Option B (reuse clips like `earthCosmicWebLoop`/`flyout`):** No new mechanism, but a tour in disguise (ruled out for Highlights in Q5) and a long animation on click.
- **Option C (new FocusableTarget types):** URL deep links for free, but a focus implies selecting something and showing an InfoCard, and there's no object to select.

**Decision:** A. Card actions become `focus | view | play`. No deep link for views in this effort.

## Q7: Curated lists or pulled from the registries?

**The question:** Hand-curate every tab, or pull Solar System / Missions / Milky Way from `SCENE_BODIES`?

**Considerations:**
- **Option A (mixed):** Registry tabs stay complete automatically (a new `/add-mission` spacecraft appears on its own). Curated where picking is the point. Cost: a new body needs a screenshot.
- **Option B (everything curated, one file):** Full control over order, one place to edit. Risk: goes stale when a body is added.
- **Option C (a `featured` flag on seed records):** Nothing stored twice, but it puts palette presentation into physics seed tables, and structures/views have no seed record to carry it.

**Decision:** B. The user prefers one authored file with full control over membership and order.

## Q8: Do we guard the curated lists against going stale?

**The question:** With B, what stops a new body from quietly never reaching the palette, the discoverability problem again?

**Considerations:**
- **Option A (coverage test):** Every `SCENE_BODIES` id is on a card or on an explicit `NOT_FEATURED` list. Plus a check that every card has an image.
- **Option B (image check only).**
- **Option C (no guard; a checklist line in the `add-mission` skill).**

**Decision:** C. No test. Follows from this: a card whose image is missing falls back to a text-only tile rather than disappearing, so a missed capture still leaves the card discoverable.

## Q9: What picture does a tour or clip card get?

**The question:** Focus cards use their focus framing and view cards use their preset. A tour has no single camera.

**Considerations:**
- **Option A (the tour card names a view preset for its thumbnail):** Reuses Q6, nothing new to build.
- **Option B (capture a frame at a fixed time in the clip):** Truer to the tour, but the harness must drive clip time, and the chosen frame drifts whenever the choreography changes.
- **Option C (hand-made image or title card):** Breaks Q2's one-pipeline rule.

**Decision:** A.

Capture-pipeline defaults (not objected to): `npm run capture-featured`, headless against the dev server through the `record`/`perf` harness, clock paused, UI hidden, waits until loading settles. Output is webp files committed at `public/images/featured/<cardId>.webp`. Only cards with no image get rendered unless `--force <id>` is given.

## Q10: What does the hover tooltip say for non-galaxy cards?

**The question:** Galaxy cards show `FeaturedCardTip` from famous meta. Bodies, structures, views and tours have no matching blurb.

**Considerations:**
- **Option A (a one-line blurb per card in the curated file):** One source, written for someone browsing the grid, the same for every card type. Cost: about 90 lines of copy.
- **Option B (pull from existing metadata per type):** No new copy, but a different look per card type, and the facts tables are data sheets rather than hooks.
- **Option C (no tooltip):** "S2" or "Laniakea" tells a newcomer nothing.

**Decision:** A, and **the user writes the copy**. The format must be comfortable to edit by hand (Q11).

## Q11: What format do you edit the cards in?

**The question:** What file format keeps hand-editing easy and still safe?

**Considerations:**
- **Option A (one typed TS file, `src/data/palette/featuredTabs.ts`, view presets in `featuredViews.ts`):** TS catches mistyped action kinds and missing fields, edits show up in the open palette straight away, and it matches `FEATURED_IDS` and the clip/tour registries. Cost: TS syntax, and prettier reflows long blurbs.
- **Option B (JSON/YAML validated at load):** Lighter to edit, could move to R2, but needs a schema check for safety TS already gives, and YAML adds a parser.
- **Option C (dev-only in-palette editor):** The most natural way to make view presets, but a large UI surface to maintain.

**Decision:** A, plus one small dev-only helper: a debug-panel button "copy current camera as view preset" that puts a paste-ready snippet on the clipboard. Writing presets by hand in Mpc is the one part where hand-editing actually hurts.

## Q12: Which tab shows when the palette opens?

**Considerations:**
- **Option A (always Highlights):** No state, behaves the same every time.
- **Option B (last tab used):** Saves a click for returning users.
- **Option C (depends on where you are):** Clever but unpredictable, and reads camera state inside a search component.

**Decision:** B, stored in the **RTK UI slice** (not `localStorage`): remembered for the session, reset on reload. A fresh load opens on Highlights.

## Q13: Keyboard navigation with an empty query?

**The question:** The current featured grid is mouse-only. Focus lives in the input, and ↑/↓ drive the results list.

**Considerations:**
- **Option A (arrow keys move around the grid, focus stays in the input):** Enter activates, typing switches to search, ⌥←/⌥→ switch tabs, and the tab strip is also real `role="tab"` buttons. Cost: ↑/↓ needs the column count (measured or fixed per breakpoint).
- **Option B (Tab key only):** Nothing to build, but walking 26 planets with Tab is painful, and focus leaves the input.
- **Option C (mouse and touch only):** The feature we most want found can't be reached from a keyboard-first palette.

**Decision:** A.

## Q14: Can you type your way to views and tours?

**The question:** Focus targets are already searchable. Views and tours exist only as cards.

**Considerations:**
- **Option A (search view and play cards by label):** One new `ScoredRow` kind scored like famous rows. Selection becomes an action (`focus | view | play`) rather than always a focus id, which touches the single `requestFocus` bridge.
- **Option B (search stays focus-only):** Selection contract unchanged, but typing "tour" finds nothing.
- **Option C (every card searchable, blurbs included):** Duplicate rows for focus cards, and matching on blurbs gives noisy rankings.

**Decision:** A, with no duplicate entries allowed. Settled in Q15.

## Q15: Avoiding duplicates when a view is framed on a searchable object

**The question:** A card like "Saturn, rings view" is a `view` on something that already has a search row. How do we avoid two "Saturn" rows?

**Considerations:**
- **Option A (a view's anchor is a focus id or nothing; only anchorless views and tours get search rows):** One rule, decided by an existing field. Searching an object always does a plain focus, whichever cards exist. Cost: search doesn't give the curated framing.
- **Option B (same rule, but the card's view replaces the body row's action):** A prettier result, but a body's search behaviour then depends on whether a card happens to exist, the kind of hidden special case the entanglement radar flags.
- **Option C (dedupe by label at ranking time):** Fragile name matching ("Saturn" vs "Saturn's rings"), and fixes the ranker after the fact instead of preventing the duplicate.

**Decision:** A.

## Q16: How do we split this into PRs?

**Considerations:**
- **Option A (three PRs, each useful alone):** (1) tabs + curated file + focus cards, with text-only tiles until images exist; (2) capture pipeline + images; (3) `view` + `play` actions, view presets + copy-camera helper, Tours tab, Highlights views, card search rows, and the selection-contract change. Small reviews, and PR1 goes live fast. Cost: Highlights ships without its two view cards at first, and the capture script needs a second pass after PR3.
- **Option B (one PR):** The whole design lands at once, but a big diff and nothing ships until all of it works.
- **Option C (two PRs):** UI + actions, then capture.

**Decision:** A.

Mobile default (not objected to): the tab strip scrolls sideways and the grid drops to 2–3 columns, with no separate layout.

## Q17: Can a view turn layers on or off, and what turns them back?

**The question:** The Cosmic Flows card needs the flow field on and the galaxies off; the Cosmic Web card needs the galaxies off. A card that changes settings could leave them stuck.

**Considerations:**
- **Option A (view carries layer overrides, snapshot + restore like tours):** Nothing sticks, and it reuses the tour's `mergeSnapshot` restore. Cost: "leaving the view" needs a definition. The definition proposed was anything that changes what the camera looks at (restore only the keys the view changed; a key the user touched while in the view keeps the user's value).
- **Option B (just turn it on, it stays on):** Nothing to build, but it produces exactly the stuck-on state.
- **Option C (play the existing `cosmicFlows` clip):** No new mechanism, but it's an animation.

**Decision:** A, then made moot by Q18: a tour already restores everything it changed when it ends.

## Q18: Is a view just a one-beat tour?

**The question:** The user wants views to carry longer text (info-card-like), an explicit Exit button, and no other UI, which is what a tour already does.

**Considerations:**
- **Option A (a view is a one-beat tour in `tourRegistry`; the card action is `play`):** No new `view` mechanism. Tour mode already provides UI hiding, the caption overlay, Exit (button + Esc) and settings snapshot/restore. The beat's enter clip flies to the pose (`flyToClip`). Cards drop back to two actions, `focus | play`. Removes from the spec: the `view` action, a second snapshot path, the "next navigation" definition, and the anchorless-view search rule (Q15 simplifies to "play cards get search rows"). Costs: the Highlights "no tours" rule becomes "no *multi-beat* tours", and single-beat tours need their own overlay layout (designed below).
- **Option B (separate view mechanism):** Could look unlike a tour, but rebuilds snapshot/restore, overlay and exit next to the existing ones.

**Decision:** A ("probably A", pending the view overlay design). Separately, one "go to pose" command with an `instant` flag: animated for users, a hard cut for the capture script.

## Q19: Views as a separate feature, and one takeover slot (refactor-ground checkpoint, 2026-09-19)

**The question:** Q18 made a view a one-beat tour. On review the user asked whether a view with this much of its own UI is really a separate feature. If views are separate, how does the app track "a tour or a view has taken over the screen"?

**Considerations:**
- Code facts against Q18:
  - A beat lasts as long as its dwell clip, and the run ends after the last beat (`guidedTourSaga.ts:118`), so a one-beat "view" would close by itself.
  - `TourOverlay` shows prev/next/pause/countdown, and `BeatCaption` is only `{title, body, position}`, but V6 needs a kicker, lede, sections, facts, sources and a toggle.
  - Folding views into tours would mean branching tour code on "is this a view" in three places.
- What views do share with tours: `captureScene`/`restoreSceneSaga` (already standalone functions), hiding the UI, Esc/Exit, and the fly-in clip. A greenfield design pass (a subagent that saw only the requirements, not the code) reached the same split: a shared **takeover** primitive, with tours and views on top of it.
- **Option 1 (one takeover slot):** `takeover.active: {kind: 'tour', id} | {kind: 'view', id} | null`. Tours and views can't run at the same time, "UI hidden" has one takeover term, and Esc clears the slot. The tour slice keeps only beat/pause/dwell state. `selectTourActive` becomes `takeover.active?.kind === 'tour'`, so its 9 reader files don't change; only the 2 writes in `tourSlice` move.
- **Option 2 (a separate `view.active` flag):** Smaller today, but hide-UI and Esc grow another term for each takeover mode.
- Kept from the existing code rather than the greenfield design:
  - Snapshot the whole scene up front, not a key-by-key change record. The snapshot already covers the in-view toggle.
  - The tagged `ScoredRow` union with lookup tables, not flat `{label, action}` rows.
- Adopted from the greenfield design: an explicit optional `image` path on each card, and structured `View` data (pose, settings patch, notes, optional toggle).

**Decision:** Views are their own feature, **reversing Q18** and going back to Q6-A: card actions are `focus | view | tour`, and a `viewRegistry` sits beside `tourRegistry` with its own `ViewOverlay` (the V6 design). The takeover is tracked with **Option 1, one takeover slot** (the user: "the cleanest"). Prep packaging: the three prep items (move the snapshot helpers to `state/scene/`, the `takeover` slice, `actionForRow`) **ride PR3** as their own commits at its start. PR1 needs no prep.

## Q20: What does a galaxy card's tooltip show?

**The question:** Today a galaxy card's hover shows the famous metadata: the type code, "Also known as …", and a 213–619 character catalogue description. Every other card gets a one-line blurb the user writes (Q10).

**Considerations:**
- **Option A (blurb plus an automatic alias line):** Every card shows the user's blurb. An "Also known as" line appears whenever the card's focus target has catalogue names (galaxies today). This keeps the alias line the user asked for when the grid was built, and every tooltip stays short and in the same voice. The lookup is generic, with no galaxy-only branch.
- **Option B (blurb only):** The simplest, but loses the automatic aliases.
- **Option C (galaxies keep the metadata tooltip):** No new copy, but two tooltip styles in one grid and a branch on "is this a galaxy".

**Decision:** A. The type code and long description leave the grid tooltip; they stay on the InfoCard. The user writes 15 more blurbs for the Galaxies tab.

## Design pass (2026-09-18/19)

Canvas: https://claude.ai/code/artifact/71771eee-45d3-41f5-957a-01bd03d931fc (pages: Current · Round 1 directions · Cosmic Web view · Body type).

- **Palette:** contact-sheet grid (the current 5×3) with **Cormorant serif tabs**; **no scale chips on cards** (the user found them distracting). Round-1 alternatives B (scale filmstrip), C (lead card) and D (tab rail) were not picked.
- **Highlights (15, smallest → largest):** Perseverance, Hubble, Earth, Saturn, the Sun, Solar System (view), Voyager 1, Sgr A*, Milky Way, Andromeda, Local Group, Virgo Cluster, **Cosmic Flows** (view: flow on, galaxies off; replaced Laniakea), **Cosmic Web** (view: galaxies off), Observable Universe (view). Galaxy and structure thumbnails are captured *with the focus kept* so the background dims.
- **View overlay (Cosmic Web), chosen V5 → V6:** the tour caption bottom-left (kicker, 48px serif title, italic serif lead-in), notes **directly on the scene** (no glass card) top-right over a dark right-side vignette, and an "Exit view · Esc" pill at the bottom centre. Notes sections: What you're seeing · How it was made · Key (inferno ramp void→filament→knot + **galaxy toggle**) · facts (~325,000 galaxies, 44–476 Mpc, 0.78 Mpc voxel, 712×1200×728 grid) · Sources (SDSS DR17 Cosmic Slime VAC / Wilde 2023; MCPM / Elek & Forbes 2022; Burchett 2020; Polyphorm GitHub; all from docs/DATA.md). User spacing ruling: section headers Cormorant **24px** (raised from 22px on 2026-09-19), header→content gap **12px**, applied to every section.
- **Typography (decided 2026-09-19): body = Sora Thin (100).** Three voices: Cormorant = headers, Sora = body, mono = data only (labels, figures, citations, key hints). Candidates tried on the canvas: Instrument Sans, Space Grotesk, Schibsted Grotesk, Hanken Grotesk, Manrope, Sora, first at Light 300 and then at Extra Light 200. The user wanted lighter weights, and only Hanken, Manrope and Sora go below 300; Sora won. Body colour `#cfd8ff` (the app's base foreground), one step below the `#e8eeff` headers, at 13.5px/1.6. Landmine: 100 is very thin, so check legibility over the bright filaments in the real app; if it breaks up, raise the size before the weight. Rollout: a `--font-family-body` token (plus a body weight) in `global.css`, with Sora loaded next to Cormorant; switching InfoCard and tour captions to it is its own PR.

## Capture spike findings (feed PR2)

Throwaway Playwright script against the dev server (`?perf&cinema`): `__skymapPerf.dispatch/getState/setPose`, declutter via `settings/mergeSnapshot` (all `labelEnabled` false, orbit trails off, structures off), `#t=<ISO>` pins the sim clock. **Landmine:** a focus fly-in overwrites a `setPose` issued before it settles; re-apply after the settle and verify by dispatching `camera/logCameraState` and reading the console. Other findings: the selection ring shows whenever the focus is kept, so capture needs a ring-off switch; `setPose` has no site-frame arm (a rover pose needs a seam).

User-framed poses (verified live):
- **hubble:** t=2026-09-18T13:00:12Z, focus `body-hubble`, yaw -1.938340168882169, pitch 0.09915032713380474, distance 6.55234811878065e-22 Mpc.
- **voyager1:** t=2026-09-18T12:56:32Z, focus `body-voyager1`, yaw 3.8408163993487223, pitch -0.6565563346622649, distance 2.356833031514677e-22 Mpc.
- **cosmic-web:** no focus, target [-181.2045404245461, -29.471262938089055, 52.200784784155374], yaw -3.93753522022247, pitch 0.4135452242339458, distance 251.18526964731848 Mpc; galaxy catalogs + Milky Way off.
- **flow:** no focus, target origin, yaw 5.9, pitch 0.35, distance 250 Mpc; flow on, galaxies + Milky Way off.
- **perseverance:** default site framing at t=2026-09-18T06:00:00Z is lit. The user's site pose (heading -2.084675604349344, elevation 0.2050471166478657, range 5.160687610215391 m, eye height 1.050784581690345 m, t=2026-09-19T10:14:04Z) needs the site-pose seam.

## Next

1. Optionally, a Solar System tab artboard (about 27 cards, scrolling) to check a long tab.
2. Then `refactor-ground` → spec (targets Q18: views and tours share one `play` path) → plan for PR1.
