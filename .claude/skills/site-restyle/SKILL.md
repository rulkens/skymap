---
name: site-restyle
description: Restyle a page of the Skymap website (packages/website) to award level through a screenshot round trip: study the bar, plan one direction, restyle section by section, then shoot desktop and mobile, critique, fix and repeat until nothing obvious is left. Use when asked to restyle, redesign or "make stunning" a site page or section.
---

# Site restyle

A design pass on one page of the companion website, run as a visual round trip. The screenshots are the work: every claim about how a section looks rests on a shot you looked at.

## Hard rules (the owner's rulings)

- **Real renders and films only:** `Shot`, `FeatureFilm`, `data/siteLoops.ts`. No drawn stand-ins, stock textures, gradient washes, glows, glass, boxed cards or gimmicks.
- **The Open app button (`OpenApp`) is closed:** never restyle it. Places ("Pick somewhere to start") is final.
- **Copy and headings stay as they are.** A restyle is not a rewrite. If a heading must change, change the page's `<page>.structure.yaml` too.
- **Motion answers scroll or the pointer.** Nothing loops for decoration, `prefers-reduced-motion` removes it all, and no new runtime dependencies.
- **Shared components** (`components/shared/**`, `useGallery`) change only opt-in: a new optional prop or parameter whose default keeps every other page identical.
- **Read first:** `docs/superpowers/conventions/ui-ux.md` and the page's own components.

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
