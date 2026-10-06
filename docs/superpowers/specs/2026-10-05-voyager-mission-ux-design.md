# Voyager exhibit: UX design

> [!TLDR]
> The exhibit opens on both full trails forking out of the planets' plane. The notes column carries a **two-lane mission timeline** whose axis is split into the mission's own two eras (Planetary 1977–1989 · Interstellar 1990–now). Its event rows light up in turn as the clock runs, so the trail in the scene and the lane fill in the panel grow together.
> Core is one section kind plus data and copy, inside Task 11 with a few S-sized extras flagged. Next adds camera affordances (a flagged deviation) and live distance readouts. Later adds a time-driving tour and the Pale Blue Dot view.

Mockup: `sketch.html` (same folder). It shows the desktop at 1280×800, a 400 px phone frame, and the timeline's edge states. Items marked with a dashed **NEXT** tag are hints only.

---

## 1. Observed skymap style (evidence)

**Type: three voices, each with a fixed job.**
- **Display serif.** Cormorant Garamond 600, self-hosted (`src/styles/global.css:55-60`, token `--font-family-display` `:235`). It is used for the exhibit title (48 px, `#fff`, `text-wrap: balance`, `ExhibitOverlay.module.css:113-127`), section headings (24 px, `:179-187`), fact values (18 px, `:327-333`) and the italic lede (22 px, `:140-149`).
- **Thin sans.** Sora 100, used *only* for exhibit body copy: 13.5 px / 1.6 in `--color-fg-base` (`global.css:62-68`, `ExhibitOverlay.module.css:189-200`).
- **System mono.** `ui-monospace` (`global.css:225`) is the instrument voice: the kicker (10 px, `0.18em`, uppercase, with a 28 px accent hairline prefix, `ExhibitOverlay.module.css:94-111`), fact labels (9 px, `0.1em`, uppercase, `:318-325`), source rows (`:354-387`), the TimeBar readout `YYYY-MM-DD HH:MM UTC` with tabular numerals (`TimeBar.module.css:40-42`, `utils/time/formatSimClock.ts:22-30`), and the beat-rail titles (`TourBeatRail.module.css:61-76`).

**Colour: one narrow blue-white family, no second hue in the chrome.**
- **Foreground.** It steps down from `--color-fg #e8eeff` through `--color-fg-base #cfd8ff`, `--color-fg-tertiary rgba(200,220,255,.7)` and `--color-fg-label rgba(160,180,230,.55)` (`global.css:81-108`).
- **Accent.** One accent, `--color-accent #a8d0ff` (`:113`), carries hairlines, focus rings, the "now" button and the current tour dot.
- **Surfaces and borders.** Glass surfaces are `rgba(8,12,28,.6–.72)` with `blur(12px)` (`:130-139`, `:329`). Borders are `rgba(160,200,255,.1–.25)` (`:159-174`).
- **The one sanctioned exception** is the pinned-badge gold `#ffd97a`. It is deliberately *not* a token (`global.css:47-49`).
- **Voyager's scene colours** are thermal-blanket gold `[0.5,0.42,0.2]` and amber `[0.5,0.36,0.16]` (`src/data/bodies/palette.ts:33-36`). The trail pass will use them, which makes them the only legitimate warm colours for this exhibit's UI: a legend for what is on screen, not decoration.

**Composition: text over the live field, no card.**
- Exhibits are "notes on the scene" (`ExhibitOverlay.tsx:1-7`). The caption sits bottom-left (`left 44 / bottom 74`, max 520 px, `.module.css:69-78`) and the notes column top-right, 360 px wide (`:152-161`). Two sized radial scrims keep both legible (`:42-66`).
- Data blocks are separated by a fading hairline (`:222-226`). The exit pill sits bottom-centre with an `Esc` key chip (`:390-444`).
- The TimeBar stays visible during an exhibit while the rest of the HUD hides (`App.tsx:148-159`). It is a bottom-right glass pill (`TimeBar.module.css:20-77`).

**Density and spacing.**
- Spacing uses a 2 px-step scale (`global.css:273-283`). Panels set 11–12 px mono (`:240-246`).
- The exhibit column is airier: 16 px gaps between sections, 12 px inside them (`ExhibitOverlay.module.css:159,176`).

**Motion: calm, staged, on the camera's clock.**
- Copy waits for the fly-in's near-landing (`--exhibit-enter-delay`). It then rises 14 px and fades over 0.9 s, staggered 0.13 s per section (`:16-32,165-171`).
- With reduced motion the slide goes and the fade stays (`:449-454`). The TimeBar drops its transitions (`TimeBar.module.css:309-315`).
- The held exhibit drifts at about 1°/s (`exhibitBodySaga.ts:24-34`).

**Vocabulary to reuse.** The tour rail's 5 px dots use three states: upcoming `rgba(168,208,255,.18)`, done `--color-fg-label`, and current `--color-accent` scaled ×1.6 (`TourBeatRail.module.css:39-55`). The rail is hidden on phones because touch has no hover (`:95-102`).

**Copy tone.** Exhibit copy is plain declarative prose with curly quotes and real numbers (`src/data/exhibits/solarSystem.ts:64-75`). The tour's style guide bans hype, imperatives ("look at…"), the triad, grandiosity nouns and **em-dashes** (`docs/tour/writing-style.md:28-70`). Existing exhibit copy still uses em-dashes (`solarSystem.ts:74`). All copy below follows the stricter tour rule.

**Mobile.** At ≤768 px the caption and notes go full-width with 24 px insets, the title drops to 32 px, and the notes scrim becomes a top gradient (`ExhibitOverlay.module.css:457-478`).

---

## 2. Experience narrative

### First 60 seconds

| t | What happens | Why it works |
|---|---|---|
| 0 s | The visitor opens the palette and picks the **Voyager** card in *Highlights* or *Missions*, or arrives from `#exhibit=voyager`. | It is the existing exhibit entry, a palette card row, with no new surface. |
| 0–3 s | The camera flies out to the whole-mission framing at the visitor's current clock (normally today). Both trails are already drawn in full: a gold line climbing north out of the planets' plane and an amber one bending south. The Sun and the orbit rings form a small bright knot at the centre. | The opening image is the whole 49-year mission, and the fork is the story in one shape. |
| 3–5 s | Copy assembles. The kicker reads **Exhibit**, then the title **Voyager**, then the lede: *Two spacecraft launched sixteen days apart in 1977. Between them they passed all four giant planets, and both still send data from beyond the edge of the solar wind.* | It uses the existing entrance choreography. |
| 5–8 s | The notes column fills in. A short "What you're seeing" note comes first, then the **timeline**. Its two lanes, V1 gold and V2 amber, are filled to the right edge because it is today. The newest row, *Voyager 2 · Heliopause*, is expanded with its one-line caption. | The lanes mirror the trails and teach how to read the panel. |
| ~10 s | The visitor clicks **1977-08-20 · Launch**. The clock jumps, both lane fills collapse to the left edge, and in the scene **49 years of trail retract to Earth in one frame**. The camera holds still, as ruled. | Cause and effect sit side by side: the panel and the scene move together. |
| ~15 s | The hint row below the list reads `\ run the clock · ] faster`. The visitor presses `]` a few times and then `\`. The clock runs at about 1 mo/s; the craft leave Earth and the trails grow back. | It uses the existing global shortcuts (`keyboardShortcuts.ts:63-71`) and avoids a duplicate transport. |
| 20–60 s | As the clock passes each closest approach, the matching row **lights up and expands**. *Jupiter: active volcanoes on Io.* *Titan: the flyby bends Voyager 1 north for good.* Then Saturn, Uranus, Neptune. In the scene the gold trail kinks out of the plane at Saturn, exactly when the Titan row says it will. | The story plays itself without any camera choreography. The visitor learns the sequence by watching it. |

### Deeper path (minutes 1–10)

1. **Compare the twins.** Drag the thumb across 1979–1981. The lanes show Voyager 2 trailing its twin by four months at Jupiter and nine at Saturn. The rows interleave.
2. **Why only one went on.** The "Why the paths part" note explains the Titan trade. Jumping to *Titan* and then *Saturn (V2)* shows it in the trails.
3. **The long quiet.** The axis breaks at 1990, where NASA renamed the mission the Voyager Interstellar Mission. The right half is sparse: the Pale Blue Dot, the pass of Pioneer 10, two termination shocks and two heliopause crossings. Each row's caption glosses one term ("the termination shock, where the solar wind suddenly slows").
4. **Close looks** (orbit or zoom by hand today; Next adds **Look closer**). At the Neptune row, scrolling in shows Voyager 2 skimming the north pole, with the trail occluded by the planet.
5. **Share a moment.** The URL `#exhibit=voyager&t=1980-11-12T05:41Z` opens the exhibit at the Titan flyby. This works today: `t` lands before the exhibit opens (`navigateSaga.ts:1-7,147-151`), and P5 captures the clock afterwards.
6. **Exit** with `Esc` or the pill. The clock, scene and focus return to how they were (P5).

---

## 3. Component inventory

Costs: **S** under half a day · **M** 1–2 days · **L** a week or more. "Task 11" means inside the plan's listed files; ⚑ marks anything outside them.

### Core: ships with Task 11

#### C1. `timeline` exhibit section: ExhibitTimeline (M)

This is the heart of the feature. It is a notes-column section with three stacked parts, plus a meta line in its header.

**a. Header.** Section heading "Timeline" (display 24 px). The meta line is mono 10 px tertiary: `1,180 days after the first launch`. It is live while the clock runs (`aria-live="polite"` is throttled, so it is not announced per frame; announcements come only after a jump).

**b. Track (`role="slider"`).**
- **Eras.** Equal-width segments, one per `eras[]` entry: *Planetary 1977–1989* and *Interstellar 1990–now*. Mono 9 px uppercase labels sit above, with a 1 px break gap between segments.
  - The piecewise axis is the fix for linear time. On a linear axis, 10 of the 15 events crowd into the left fifth of a 330 px track.
  - The break is not a fudge. It is the mission's own phase change and it carries a caption.
- **Lanes.** One per craft, in event order (V1, V2). Each lane has:
  - a mono 9 px label (`V1`, `V2`) in the lane colour;
  - a 1 px base line in `--border-divider`;
  - a 2 px **fill** in the craft's trail colour, from launch to `min(sim, now)`.

  The fill is the in-panel twin of the trail.
- **Ticks** on their lane use the rail's dot vocabulary: 5 px; passed `--color-fg-label`; upcoming `rgba(168,208,255,.18)`; current `--color-accent` ×1.6. Glyph by kind:
  - flyby: dot;
  - launch: open ring;
  - boundary: 8 px vertical bar;
  - milestone: 5 px diamond.
- **Thumb.** A 1 px accent hairline across both lanes, with a 9 px knob on top.
- **Axis.** Mono 9 px tertiary labels: `1977 · 1980 · 1985 · 1990 | 2000 · 2010 · 2020 · now`.

**c. Event list.** It is chronological and interleaves both craft.
- Each row is a `<button>` laid out on a grid: `[glyph in lane colour] [date, mono 11 px, 10ch] [label, mono 11 px fg] [craft tag, mono 9 px]`.
- The **current row** is the last event at or before the sim time, marked `aria-current="true"`. It gets a 2 px accent left rule, its label in `--color-fg`, and below that:
  - its caption (Sora 100, 12.5 px);
  - for flybys, a mono 10 px line: `184,300 km from Saturn's centre`.

**d. Hint row.** Mono 10 px tertiary with key chips styled like the exit pill's `Esc` chip (`ExhibitOverlay.module.css:436-444`): `\ run the clock · ] faster · , . previous / next event`. On `(pointer: coarse)` it reads *Run the clock from the time bar below.*

| State | Track | List |
|---|---|---|
| Before the first launch | Empty fills; thumb pinned at x = 0 with a small `before launch` label | No current row. The first row's caption shows greyed: *Neither craft has flown yet.* |
| Mid-mission, paused | Thumb at the sim time | Current row expanded |
| Playing | Thumb moves with no transition, read from the same throttled time source as the TimeBar readout | The current row changes as events pass. The expansion is instant under reduced motion and a 150 ms height and opacity transition otherwise. |
| Live / today | Thumb at the right edge | The newest event is current |
| Past today (the clock can run to 2100) | Thumb pinned at the right edge, plus a `→ 2031` chip at the edge in mono 9 px accent | Unchanged |
| Hover or focus on a row | The matching tick gets an accent ring (local hover state) | — |

**Interaction.**
- **Click or drag on the track:** `setSimDays` continuously, using pointer capture and `touch-action: none`. Rate and play state are untouched.
- **Click a row, or press Enter/Space on it:** `setSimDays(event instant)`. Rate and play state are untouched and the **camera does not move**, as ruled.
- **Keys on the focused track** (the same pattern as `common/Slider/Slider.tsx:116-145`):
  - ←/→: ±1 month
  - Shift+←/→: ±1 year
  - PageUp/PageDown: previous or next event
  - Home: first launch
  - End: now
- **`aria-valuetext`** reads like `12 November 1980, 23:46 UTC, Voyager 1 at Saturn`. The event part is added when an event lies within ±1 day.

**Keyboard reachability (⚑ S).**
- `Tab` is **globally bound to hide the UI, with `preventDefault`** (`keyboardShortcuts.ts:61`). Keyboard users cannot Tab into any exhibit control today; this is a pre-existing gap.
- The minimum Core fix is two gated global shortcuts, `,` and `.`, for the previous and next timeline event while an exhibit with a timeline is up. They follow the same pattern as the tour's arrow keys (`keyboardShortcuts.ts:72-77`). They need no focus and dispatch the same `setSimDays`. A polite live region in the section header announces `Voyager 1 · Saturn · 1980-11-12`.
- Fixing `Tab` itself is a separate backlog item.

**Mobile (≤768 px).**
- The track spans the full width. The lane labels collapse to the gold or amber 3 px swatch and the tag.
- Rows are at least 40 px tall. The hint row switches to its touch copy.
- The thumb knob grows to 14 px, and the hit area is the full track height (36 px).

**Data shape.** Spec §3 plus the deltas marked `+`:

```ts
// src/@types/missions/MissionEvent.d.ts
export type MissionEvent = {
  id: string;                  // + 'voyager1-saturn': stable key for captions and links
  bodyId: string;              // the craft: 'voyager1'
  kind: 'launch' | 'flyby' | 'boundary' | 'milestone'; // + 'heliopause' becomes 'boundary'; + 'milestone'
  iso: string;                 // '1980-11-12T23:46Z' (minute) or '2012-08-25' (day precision)
  label: string;               // 'Saturn'
  targetId?: string;           // + flyby target body id ('saturn'); Next N2 reads it
  closestKm?: number;          // + flyby centre distance, from the build tool's minimum search
};

// src/@types/exhibits/ExhibitTimelineSection.d.ts
export type ExhibitTimelineSection = {
  readonly kind: 'timeline';
  readonly heading: string;                       // + 'Timeline'
  readonly fromIso: string;                       // '1977-08-20'
  readonly events: readonly MissionEvent[];       // MISSION_EVENTS, filtered by the exhibit
  readonly eras?: readonly TimelineEra[];         // + equal-width axis segments; absent = one linear span
  readonly captions?: Readonly<Record<string, string>>; // + event id → one line of copy
};

// src/@types/exhibits/TimelineEra.d.ts
export type TimelineEra = { readonly label: string; readonly fromIso: string };
```

- **Lane colour and label** are derived, not authored: unique `bodyId`s in event order give the lanes. The label comes from `SCENE_MESH_BODIES`. The colour is the craft's trail palette entry converted to CSS, so the panel and the trail share one source.
- **Captions** live in the exhibit (`voyager.ts`), not in the generated events file. Copy is authored; times are measured.
- **Pure helpers** in `src/utils/`, one per file:
  - `timelineFraction(ms, axis)`: the plan's tested "thumb follows sim day" helper, now piecewise;
  - `timelineInstant(fraction, axis)`: its inverse, for drag;
  - `currentMissionEvent(events, ms)`;
  - `formatEventDate(iso)`, which shows a day-precision iso as a date only.

**Reuses.** The exhibit section dispatch (P4), `setSimDays`, the takeover clock restore (P5), the rail's dot states, the source-row and fact-label type styles, the Slider key pattern, and the global shortcut table.

**Generalises.** New Horizons gets one lane and eras *Pluto · Kuiper belt*. Pioneer 10/11 get two lanes. Cassini wants `toIso` (see Later L6). No per-craft code.

#### C2. Voyager exhibit data: `src/data/exhibits/voyager.ts` + registry row (S)

- `settings`: orbit trails on (as `solarSystem.ts:44`), starfield trimmed to about 0.3, and picking for bodies and stars.
- `pose`: whole-mission framing via `fitRadiusMpc ≈ 190 AU`. Pitch is about 15° above the ecliptic. Yaw is chosen so both outbound headings sit near-perpendicular to the view and the fork reads as an up/down split. Derive it with `orbitAnglesLookingAlong`, never a hand-rolled inverse; yaw and pitch are ecliptic-frame. This needs an eye-check.
- Body order: prose *What you're seeing* → **timeline** → prose *Why the paths part* → prose *The Golden Record* → facts → sources. Copy is in §4.

#### C3. Notes column scroll: generic, CSS only (S, ⚑ `ExhibitOverlay.module.css`)

- **The problem.** The Voyager column is taller than a 800 px viewport, and `.notes` has no overflow handling (`:152-161`).
- **Desktop:** `max-height: calc(100vh - 140px); overflow-y: auto; pointer-events: auto; scrollbar-width: thin`, with a bottom fade mask.
- **Mobile:** `max-height: 52vh`.
- **Cost:** a wheel or drag over the column no longer orbits the camera. It is the text column, so this is acceptable. It benefits every exhibit.

#### C4. Mobile exit pill and TimeBar collision fix: generic, CSS only (S, ⚑)

- At 400 px a manual-mode TimeBar is about 368 px wide (`TimeBar.module.css:35-36`) and sits under the centred exit pill.
- At ≤768 px the pill moves to the top-right as a compact `✕ Exit`, and the notes start below it. Desktop is unchanged.

#### C5. Palette card (S, ⚑ `featuredTabs.ts`)

- An `{ id: 'voyager', label: 'Voyager', action: { kind: 'exhibit', exhibitId: 'voyager' } }` card goes into *Highlights* (next to the existing Voyager 1 card, `featuredTabs.ts:144-151`) and first in *Missions* (`:337`).
- Blurb: *Both Voyagers from launch to today, with every flyby on a timeline you can scrub.*
- Thumbnail via `npm run capture-featured`. Until then the card falls back to its dashed text tile (`FeaturedCard.tsx`).

### Next: strong follow-ups

| # | Element | Interaction | Cost | Reuses |
|---|---|---|---|---|
| N1 | **Clock sweep on jump** | A row click animates the clock from its old to its new instant over 1.2 s (ease-out), so the trails visibly rewind or grow. Reduced motion jumps instantly. Any new input cancels the sweep. | S | `setSimDays` in a rAF loop in the container |
| N2 | **Look closer / Whole mission** (⚠ **DEVIATION**, see below) | The expanded flyby row gains a small `Look closer` button that focuses `targetId` with a framing that includes the craft. A `Whole mission` chip in the timeline header flies back to the exhibit pose. Ticks and rows still never move the camera. | M | `requestFocus` fly-to, `flyToPoseClip`, the takeover focus snapshot |
| N3 | **Live readouts per lane** | Under each lane label: `171.9 AU · 23 h 52 m light`, giving distance from the Sun and one-way light time from Earth at sim time. It is computed from the trajectory registry and Earth's snapshot state, throttled to 4 Hz. | S–M | `trajectoryRegistry`, `deriveBodyStates` |
| N4 | **Exhibit entry clock** | The exhibit may author `clock?: { rate, paused }` applied on entry, for example 1 mo/s paused at today. The visitor then presses play and sees motion at once. P5 restores the clock on exit. | S | P5 capture, `setRate`, `pause` |
| N5 | **Body card cross-link** | The Voyager 1 and 2 `BodyDetailCard` gains a row: `Mission timeline →`, which opens the exhibit. | S | InfoCard rows, `openExhibit` |
| N6 | **Copy link to this moment** | A mono `link` chip on the expanded row copies `#exhibit=voyager&t=<iso>`. | S | The deep-link grammar |

**N2 deviation in detail.**
- **Reason.** At the whole-mission framing (about 2 px per AU on a 800 px viewport), a flyby's bend is sub-pixel. The timeline can say *when* but cannot show *how*.
- **What stays as ruled.** The tick click remains a pure clock control.
- **What is added.** A separately labelled control for the camera move, shown only on the expanded flyby row.
- **Cost.**
  - It needs a focus fly *inside* an exhibit takeover. `exhibitBodySaga` must stop its 1°/s drift when the user takes the camera; its only abort today is `exitTakeover` (`exhibitBodySaga.ts:1-7,92-97`).
  - Exit already restores focus.
  - It adds about 40–60 lines and one more state the overlay can be in ("focused inside an exhibit").

### Later: ideas

- **L1. A "Grand Tour" guided tour (L).** Beats at each flyby with authored camera passes. Tours cannot drive the clock today: `SceneEffect` has no time arm (`@types/animation/SceneEffect.d.ts`, `SettingsAction.d.ts:13-17`). This would need a `time` effect kind.
- **L2. Pale Blue Dot view (M).** A clip that places the camera at Voyager 1 on 1990-02-14 04:48 UTC looking sunward with a narrow FOV, so Earth is one pixel in the glare. It reuses clips and deep links.
- **L3. Future stretch (S–M).** The track continues past today, dashed, to the end of the data (2100). Ticks would include *Voyager 1 one light-day from Earth (Nov 2026)* and *expected end of power (2030s)*. The sampled data already runs to 2100.
- **L4. Golden Record cover (L).** An overlay that explains the cover diagrams: the pulsar map, the hydrogen transition and the playing instructions.
- **L5. Heliosphere context.** Once the heliosphere effort lands, the boundary ticks gain a toggle that shows the termination shock and heliopause surfaces in the scene.
- **L6. `toIso?`** on the timeline section, for missions that ended (Cassini 2017).

---

## 4. Copy (draft, Core)

- **Lede:** Two spacecraft launched sixteen days apart in 1977. Between them they passed all four giant planets, and both still send data from beyond the edge of the solar wind.
- **What you're seeing:** Each line is one craft's path since launch, from JPL's tracking data. The lines grow as the clock runs and shrink when it runs back. Voyager 1, in pale gold, climbs north out of the planets' plane after Saturn. Voyager 2, in amber, turns south after Neptune.
- **Why the paths part:** In the late 1970s the outer planets lined up so that one craft could swing from each to the next, an arrangement that comes round about once every 175 years. Voyager 1 gave up that chain for a close pass of Titan, Saturn's largest moon. Voyager 2 kept it, and reached Uranus and Neptune.
- **The Golden Record:** Each craft carries a 12-inch gold-plated copper record. It holds greetings in 55 languages and about 90 minutes of music, and encodes 115 images as sound. The cover shows how to play it and, using 14 pulsars, where the Sun is.
- **Facts:**

  | Label | Value |
  |---|---|
  | Launched | 1977 |
  | Giant planets passed | 4 |
  | Heliopause | 121 · 119 AU |
  | Leaving the Sun at | 17 · 15 km/s |

- **Sources:**

  | Role | Title | Publisher | URL |
  |---|---|---|---|
  | Data | Horizons System, Voyager 1 (−31) and 2 (−32) vectors | JPL SSD | https://ssd.jpl.nasa.gov/horizons/ |
  | Mission | Voyager mission | NASA Science | https://science.nasa.gov/mission/voyager/ |
  | Heliopause | Voyager 1 in interstellar space | NASA/JPL, 2013-09-12; Gurnett et al. 2013, *Science* 341:1489 | — |
  | Heliopause | Voyager 2 enters interstellar space | NASA/JPL, 2018-12-10; *Nature Astronomy* 3, Nov 2019 | — |
  | Record | The Golden Record | NASA/JPL | https://science.nasa.gov/mission/voyager/golden-record/ ⚠ verify URL |

---

## 5. Event list

All times are UTC spacecraft event time. Flyby times and distances in the shipped file come from the **build tool's** closest-approach search on Horizons vectors (spec §3). The literature column here is the cross-check: a disagreement of more than 2 minutes is a bug to chase.

Distances are **from the body's centre**, because that is what the tool measures. NASA often quotes altitude above the cloud tops instead (shown in brackets). ⚠ marks a fact to verify before shipping.

| # | id | Craft | Kind | UTC | Literature distance | Caption (one line) | Source |
|---|---|---|---|---|---|---|---|
| 1 | voyager2-launch | V2 | launch | 1977-08-20 14:29 | — | Voyager 2 launches first, on the slower path that kept Uranus and Neptune within reach. | NASA (10:29 EDT, Titan IIIE-Centaur, LC-41) |
| 2 | voyager1-launch | V1 | launch | 1977-09-05 12:56 | — | Voyager 1 follows sixteen days later on a faster path and overtakes its twin by mid-December. | NASA (08:56 EDT); overtake 1977-12-15 ⚠ |
| 3 | voyager1-jupiter | V1 | flyby | 1979-03-05 12:05 | 349,000 km | Voyager 1 finds active volcanoes on Io, the first seen on any world besides Earth. | NASA/JPL |
| 4 | voyager2-jupiter | V2 | flyby | 1979-07-09 22:29 | 570,000 km ⚠ (sources differ on centre vs cloud tops) | Four months behind its twin, Voyager 2 takes the closest look yet at Europa's cracked ice. | NASA/JPL |
| 5 | voyager1-titan | V1 | flyby | 1980-11-12 05:41 | ≈ 6,490 km ⚠ | Voyager 1 passes Titan to study its thick haze, and the encounter sends it north out of the planets' plane for good. | NASA/JPL; matches spec smoke link |
| 6 | voyager1-saturn | V1 | flyby | 1980-11-12 23:46 | 184,300 km (≈124,000 km above clouds) | Closest approach to Saturn, eighteen hours after Titan. No planet lies ahead of Voyager 1. | NASA/JPL; matches spec smoke link |
| 7 | voyager2-saturn | V2 | flyby | 1981-08-26 03:24 | 101,000 km (≈41,000 km above clouds) | Saturn swings Voyager 2 toward Uranus, a path open only because Voyager 1 had already covered Titan. | NASA/JPL |
| 8 | voyager2-uranus | V2 | flyby | 1986-01-24 17:59 | ≈ 107,000 km ⚠ (NASA: 81,500 km above clouds) | The only spacecraft visit Uranus has had. Voyager 2 finds ten moons no one had seen. | NASA/JPL |
| 9 | voyager2-neptune | V2 | flyby | 1989-08-25 03:56 | ≈ 29,240 km (4,950 km above the north-pole clouds) | Voyager 2's closest pass of any planet, over Neptune's north pole. Triton follows five hours later. | NASA/JPL; matches spec smoke link; Triton 09:23 UTC, ≈ 39,800 km ⚠ |
| 10 | voyager1-pale-blue-dot | V1 | milestone | 1990-02-14 04:48 | 40.5 AU from the Sun | From six billion kilometres, Voyager 1 photographs Earth as a dot smaller than a pixel. Its cameras are switched off 34 minutes later. | NASA/JPL (cameras off 05:22 UTC) |
| 11 | voyager1-pioneer10 | V1 | milestone | 1998-02-17 (day) | 69.4 AU | Voyager 1 passes Pioneer 10 to become the most distant object people have made. | NASA ⚠ verify distance |
| 12 | voyager1-termination-shock | V1 | boundary | 2004-12-16 (day) ⚠ | 94 AU | Voyager 1 crosses the termination shock, where the solar wind suddenly slows. | NASA, announced 2005-05-24; some sources say Dec 15 |
| 13 | voyager2-termination-shock | V2 | boundary | 2007-08-30 (day) ⚠ | 84 AU | Voyager 2 meets the same boundary ten AU closer in, on the southern side: the bubble is not round. | NASA, 2007-12-10 release; multiple crossings over several days |
| 14 | voyager1-heliopause | V1 | boundary | 2012-08-25 (day) | 121 AU | Voyager 1 leaves the heliosphere, the bubble of solar wind around the Sun, and enters interstellar space. | NASA/JPL 2013-09-12; Gurnett et al. 2013 (date set by plasma data, "on or about") |
| 15 | voyager2-heliopause | V2 | boundary | 2018-11-05 (day) | 119 AU | Voyager 2 follows. Its plasma instrument still works, so it measures the crossing directly. | NASA/JPL 2018-12-10; *Nature Astronomy* 2019 |

**Data notes.**
- Events 1, 2 and 10–15 are cited literals in the tool source, as the spec already does for launches and heliopause crossings. Events 10–13 are the additions this design asks for, and their kinds widen the union (open question Q3).
- Day-precision events jump to 00:00 UTC and display as a date only.
- Triton stays a caption rather than a row: its tick would sit on Neptune's.

---

## 6. Risks

> [!RISK] Tab is swallowed app-wide
> `keyboardShortcuts.ts:61` binds Tab to hide the UI, with `preventDefault`, so no exhibit control is Tab-reachable. Core adds `,` and `.` as a focus-free path. The real fix is backlog work.

> [!RISK] Overlay re-render per frame
> If the timeline reads raw `simDays`, the whole exhibit overlay re-renders at 60 Hz while playing. Read the same throttled time source as the TimeBar readout, and keep the timeline its own memoised component.

> [!RISK] The two Voyager golds are close
> Gold and amber differ by about 10/255 in green in sRGB. Lanes and tags carry identity, so colour is never the only cue. Whether the scene trails are distinguishable needs an eye-check (Q4).

> [!RISK] Arrow keys on the focused slider
> The tour's `left`/`right` shortcuts are gated off outside tours, so they don't collide. The slider must still `preventDefault`, or the page scrolls.

---

## 7. Open questions

1. **Entry framing.** The whole mission (fit ≈ 190 AU: both full trails, flybys sub-pixel), or the planets (≈ 45 AU: flybys legible, today's craft off-frame)? *Recommended:* the whole mission, plus N2 for close looks.
2. **N2 deviation.** Approve `Look closer` / `Whole mission` as a separate camera control for Next, or keep the exhibit clock-only for good?
3. **Event kinds.** Rename `heliopause` to `boundary` and add `milestone`, with four more cited literals in the tool: the Pale Blue Dot, the Pioneer 10 pass and the two termination shocks?
4. **Trail colours.** Spread Voyager 2 toward a deeper copper so the two trails separate on screen, or keep the current pair and let labels carry identity?
5. **Entry clock (N4).** Should the exhibit set 1 mo/s paused on entry (restored on exit), or leave the visitor's clock alone as today?

### Provisional rulings (controller, 2026-10-05, user away — reversible, flagged at landing)

1. Whole-mission framing on entry.
2. N2 not built; stays a Next item for the user to rule.
3. Event kinds widened (`launch | flyby | boundary | milestone`) with the extra cited literals.
4. Voyager 2 trail moves toward a deeper copper; labels and lanes still carry identity.
5. The exhibit leaves the visitor's clock rate alone (N4 stays Next).

### Revision 1 (user, 2026-10-06): one craft at a time

Both craft in one timeline confused: the interleaved event list, the two lanes on one track, and the time control. Rulings (sketch: two-variant mockup in the dash, variant B chosen):

1. **Craft switch.** Two tabs, Voyager 1 / Voyager 2, at the top of the timeline. The chapter bar, the scrubber ticks and the event card show only the selected craft's events. The clock stays shared.
2. **Story-first time control.** A chapter bar (one segment per event of the selected craft, past / current / future) plus Previous / Next buttons with an "n of m" count. A faint one-lane scrubber sits below and still drags freely; its dots jump to events. `,` / `.` step through the selected craft's events only.
3. **Event card replaces the list.** Only the current event shows: date, label, caption, flyby distance.
4. **Era-split axis kept** on the scrubber.
5. **The other craft dims** in the 3D view: its trail and its label render dimmed, not hidden. The emphasis ends when the exhibit exits.
