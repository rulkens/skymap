# Features page redesign — outline

Working document. Edit freely; each round we go back and forth on this file before anything is built.

## The page

- **Goal:** show what Skymap can do, mostly in pictures and film. A visitor should get it from scrolling, not reading.
- **Shape:** four parts. Each section is a heading, one short line, 1–3 visuals and a link to the guide page that explains it.
- **Not on this page:** every small feature listed. The docs keep that detail; the page links to them.
- **Replaces:** today's 13 groups and 137 rows (`data/features.ts`) and the sticky "index and stage" layout.

Visuals: ids from `data/siteShots.ts` (stills) and the place films (`place-*.mp4`). **NEW** means a shot or film we don't have yet.

---

## 1. Places

Part intro: _one line, e.g. "From a park in Copenhagen to the edge of the observable universe."_

### Earth in 3D

- **Goal:** Earth as a real globe you can fly down to, down to aerial photographs.
- **Line:** _draft_
- **Visuals:** `earth-terminator` · `lead-park` (aerial photo of the park) · film `place-earth`
- **Links to:** Guide › Moving around

### The Solar System

- **Goal:** planets, moons and orbits, where they are now.
- **Line:** _draft_
- **Visuals:** `saturn` · `lesson-solar-system` (orbits from above) · film `place-saturn` or `place-moon`
- **Also available:** `classroom-jupiter`, `start-moon-orbit`, moons `data-io`, `data-enceladus`, `data-pluto`
- **Links to:** Docs › What is in the scene › Planets and their moons

### Missions

- **Goal:** spacecraft where they are today, with their paths.
- **Line:** _draft_
- **Visuals:** film `place-voyager1` · `place-perseverance` (rover on Mars) · `lesson-voyager`
- **Also available:** `data-perseverance`, `data-spirit`
- **Links to:** Docs › What is in the scene › Spacecraft

### The Milky Way

- **Goal:** stars, the galaxy's structures, the constellations.
- **Line:** _draft_
- **Visuals:** `milky-way-drawn` · film `place-sgr-a` or `place-betelgeuse` · **NEW** constellations
- **Also available:** `lesson-milky-way`, `about-milky-way`, `guide-card-star`
- **Links to:** Docs › What is in the scene › Stars, The Milky Way

### The Cosmic Web and deep space

- **Goal:** galaxies, superclusters, the web, the flow of galaxies.
- **Line:** _draft_
- **Visuals:** `tour-cosmic-web` · film `place-virgo` or `place-andromeda` · `filaments-derived`
- **Also available:** `galaxies-measured`, `void-bootes`, `lesson-cosmic-web`, `lesson-universe`, **NEW** galaxy flow
- **Links to:** Docs › What is in the scene › Nearby galaxies, Filaments and the cosmic web

---

## 2. The Universe in Motion

### Time

- **Goal:** the scene runs on a clock you can set, speed up and reverse.
- **What moves:** _to fill in — planets and moons on their orbits, Earth's day and night and seasons, spacecraft along their paths, …_
- **Line:** _draft_
- **Visuals:** **NEW** film of time running (e.g. moons around Jupiter, or Earth's terminator moving) · `guide-conjunction` · `lesson-earth-june` with `lesson-earth-december`
- **Also available:** `start-clock`, `guide-clock`, `class-time`
- **Links to:** Guide › Time

---

## 3. Screens of all sizes

Part intro: _one line_

### Phone

- **Visuals:** `guide-phone` · `class-tour-phone` (pick 1–2)
- **Links to:** Guide › Screens, quality and domes

### Desktop

- **Visuals:** `guide-controls` · `features-card`
- **Links to:** Reference › Controls

### Domes

- **Visuals:** `dome-earth` · `dome-web` · `dome-exhibit`
- **Links to:** Domes and museums

---

## 4. Deep linking

- **Goal:** every view is a link; send someone exactly what you see.
- **Line:** _draft_
- **Visuals:** `guide-share-pose` · **NEW** a link opening on a phone?
- **Links to:** Guide › Sharing a view · Reference › URL parameters

---

## Decided

1. Today's other groups (Finding things, Tours and exhibits, Settings, Info cards, Loading, For developers) are **dropped** from this page.
2. **Hero (revised 2026-10-22):** first no hero; the owner then asked for one. It is a slideshow of app views (`FeaturesHero`, views in `data/featureViews.ts`), each with its subject on the right and a link to that view.
3. Films **play when scrolled into view**.
4. The **NEW visuals get shot** (constellations, galaxy flow, time running, the link on a phone).

5. **Layout C, alternating sides:** text on one side, a large visual on the other; sides swap each section (`FeatureSection` `side`). Revised 2026-10-22/23: the large visual became a slideshow (`FeatureGallery`, stills or films) with thumbnails, each picture linking to its view in the app; Time is a gallery of six films.
7. **New visuals picked:**
   - constellations B (names only);
   - flow B (250 Mpc, into the Great Attractor);
   - time: A as a large 16:9 film (Jupiter's moons) and B as a small disc film (Earth turning);
   - phone A (the app on a phone, Saturn).
   Their recipes are the rows in `packages/website/src/data/siteShots.ts` and `siteLoops.ts`.
8. **3D phone:** CSS only, no 3D library. A case of stacked layers that turns a little toward the pointer (sketch B), with the Saturn phone still on its screen. Used in **Screens › Phone** and on **Home**, where it replaces the Hubble picture.
9. **Words:** build with drafted lines (literal, short); the owner corrects them on the page with notes.
6. **Before the redesign:** pages move to MDX with front matter (title, description, share image, what the page is for), landing pages and docs, as its own PR.
