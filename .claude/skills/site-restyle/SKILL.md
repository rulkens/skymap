---
name: site-restyle
description: Restyle a page of the Skymap website (packages/website) to award level through a screenshot round trip: study the bar, plan one direction, restyle section by section, then shoot desktop and mobile, critique, fix and repeat until nothing obvious is left. Use when asked to restyle, redesign or "make stunning" a site page or section.
---

# Site restyle

A design pass on one page of the companion website, run as a visual round trip. The screenshots are the work: every claim about how a section looks rests on a shot you looked at.

## Hard rules (the owner's rulings)

- **The sky is always real:** pictures of space are app renders and films (`Shot`, `FeatureFilm`, `data/siteLoops.ts`), never drawn stand-ins.
- **Decoration is allowed** (owner, 2026-10-30: "we can definitely add decoration, but it needs to be applied with style and taste"). Lines, light, gradients, texture and motion may all serve the design. Each one has to earn its place in the round trip, and you must be able to say what it adds. Decoration added by default, or in the generic patterns the frontend-design skill lists, is what the owner rejected before.
- **The Open app button (`OpenApp`) may be restyled** as part of a page's design. Two directions are already rejected:
  - pictures or ambient motion inside the button ("incredibly ugly");
  - a solid light-accent fill with dark ink ("absolutely terrible").

  It is shared by every page, so a restyle must hold in the nav, the footer and over photographs.
- **Places ("Pick somewhere to start") is final.**
- **Copy and headings stay as they are.** A restyle is not a rewrite. If a heading must change, change the page's `<page>.structure.yaml` too.
- **Motion is deliberate.** It mostly answers scroll or the pointer; ambient motion is allowed where it is tasteful and quiet. `prefers-reduced-motion` removes it all, and no new runtime dependencies.
- **Shared components** (`components/shared/**`, `useGallery`) change only opt-in: a new optional prop or parameter whose default keeps every other page identical.
- **Read first:** `docs/superpowers/conventions/ui-ux.md` and the page's own components.

## Design skills: which to load when

- **Planning (step 2) and restyling each section (step 3):** load `site-composition`, beside `frontend-design:frontend-design`.
- **Critiquing (step 4.3), on every pass:** load `site-critique`. The weakest thing it names is the one thing you fix next.
- **Any section that adds or changes motion:** load `site-motion` before writing its CSS or script.

## Pictures as material, not rectangles

The owner asked: "use screenshots more creatively, i.e. integrate more into the page, cutouts". The tools for that:
- **Float a render with no frame.** The renders sit on black, so `mix-blend-mode: screen` or `lighten` lets a planet, galaxy or web float on the page frameless.
- **Feather the edges.** `mask-image` gradients make a picture dissolve into the ground instead of ending at a hard edge.
- **Shoot clean subjects.** New shot rows with `hideStars` and `hideLabels` give a clean planet or spacecraft.
- **Capture the UI on its own.** The `element` setting captures app UI on a transparent ground, for overlays (`tools/site/README.md`).
- **Make depth.** Subjects can break out of their frame, overlap across columns and move in parallax on scroll.

Every new shot row must be used on a page, or the shot test fails.

**Judge the pictures themselves, not only the layout.** On every pass, look at each picture the section uses:
- **Framing:** is the subject cropped badly or too small?
- **Background:** is it busy behind the type?
- **Labels:** are app labels showing where they shouldn't?
- **Consistency:** does it match its neighbours' angle and light?
- **Fit:** is it the right subject for the section's job?

If a picture is the section's weakest thing, ask for a new one rather than designing around it. Either reshoot the row yourself with `npm run site:shots -- --url <app> --only <id>`, or send a request to whoever runs the shoot, with the subject, view or pose, size and why.

## 1. Shoot the before

```
npm run site:sections -- /<page>/ --widths 1440,1024,400 --label before --out <scratchpad>/restyle
```

This writes the full page and one picture per h2 section at each width, with the dev overlays and the fixed bar hidden, after one scroll through the page so lazy pictures load.

## 2. Study the bar, then plan one direction

- Look at 6–10 recent Awwwards Site of the Day winners, favouring dark, image-led, science or product-story sites. Write down concrete techniques: the type scale and contrast, the grid and asymmetry, rhythm between sections, media framing and pinning, restrained scroll motion, caption and link details. `docs/research/2026-09-17-companion-website/13-award-level-design.md` holds an earlier study; extend it rather than repeat it.
- Load the `frontend-design:frontend-design` skill. Write a compact plan: palette within the site's tokens, type roles and scale, an ASCII wireframe per section, principles. Check it against the skill's list of generic defaults and revise anything that matches.
- Spend the boldness in ONE place.

## 3. Restyle, one section at a time

Change one section, then run the loop below before the next. Commit each section on its own, with a one-sentence plain message; stage explicit paths only.

## 4. The round trip (each section, until nothing obvious is left)

1. Shoot the section's state now: `npm run site:sections -- /<page>/ --widths 1440,400 --label pass<n>`.
2. LOOK at the desktop and the phone shot with the Read tool. Never judge a section you haven't looked at in this pass.
3. Critique against the winners and the plan. Name the single weakest thing, for example:
   - weak hierarchy;
   - a cramped or empty band;
   - a picture cropped badly or too small;
   - text over a busy picture;
   - two neighbours with the same rhythm;
   - a phone layout that is merely the desktop stacked.
4. Fix that one thing. Back to 1.
5. Stop when a pass finds nothing obvious at either width. Then check 1024, and finally remove one accessory.

### Alignment (check on every pass, everywhere)

The owner's words: "alignment of the 'open this view' buttons is not there… its just not visually appealing and looks messy". Misalignment reads as mess before anything else, so check it in every shot:
- **Shared edges.** Items in a row share their top edge, and their links share a baseline: the links under tiles of uneven text sit on one line (a grid with subgrid rows, or the link pushed to the end of its column), never at whatever height the text above leaves them.
- **One left edge per column.** A section's heading, its intro text and its link start on the same left edge, or on deliberate grid columns. An icon hanging outside the text edge is deliberate and the same everywhere.
- **Gaps from the scale.** Gaps between a heading, its line and its link come from the site's spacing scale, the same in every section.
- **Lined up across neighbours.** Captions under pictures in a row line up with each other, whatever the caption lengths.
- **Measure it.** When in doubt, read the boxes with Playwright (`getBoundingClientRect` of the items in a row) instead of trusting your eye.

Check the phone shot on its own terms: tap targets at least 44 px, no sideways scroll, pictures that still read at 400 px, and order that makes sense when stacked.

## 5. Finish

- **Checks:**
  - `npm run typecheck:fast`;
  - `npm run site:check`;
  - `npm run site:build`;
  - `npm run site:links`;
  - `npm run site:structure`;
  - `npx vitest run tests/packages/website tests/tools/site`.
- **Shoot the after:** `--label after` at 1440, 1024 and 400.
- **Show the owner:** a before/after pair per section (1440, and 400 where the phone layout changed) as dash checks. The verdict is the owner's.
