---
name: mockup
description: Shoot design options for anything a person sees in the app as mockups in the real UI (real components, tokens and scene), re-shot about 0.3 s after each save. Use when the user asks for a "mockup", to "mock it up", to "show me designs" or "show me options", "what could it look like", a "shot in the actual UI", or design variants for any app HUD or panel change, before any code is agreed.
---

# `mockup` — design variants in the real UI

## When

Design options for anything a person sees in the app, **before code is agreed**: the owner's rule is
no code until agreed. Mocks are throwaway: `src/dev/mocks/` is gitignored except the example, and
the `?mock=` mount never ships. How a mock is written: `src/dev/mocks/README.md`. Flags and output:
`tools/mock/README.md`. Don't repeat them here.

## Recipe

1. Dev server running in this worktree (`/dev`); note the port from its `Local:` line.
2. One file per variant: `src/dev/mocks/<name>.tsx` (copy `example.tsx`), with an optional
   `<name>.module.css` and a plain `<name>.css` to hide or restyle real panels.
3. Start the loop in the background (`run_in_background`), once per variant:
   `npm run mock -- <name> '<hash>' --url http://localhost:<port>`.
4. Read the shot path it prints, Read the image, edit and save. Each save prints a new line.
5. `--phone` gives the 400 px variant in a second run. ui-ux.md asks for both 1728 and 400 wide.
6. A new view without a reload: write a hash as a line on the run's stdin.

## Craft rules

- **Tokens only**: `src/styles/tokens.css`, per ui-ux.md "Layout, type and colour". No raw
  colours, sizes or spacing.
- **Find real panels by `aria-label`**: CSS-module class names are hashed. Some labels come
  through props, so grep won't find the literal. `Navigation cheatsheet` is `Panel`'s `ariaLabel`
  prop in `NavigationPanel.tsx`.
- **Opaque surfaces**: put mocked elements on `--surface-card-strong` with a backdrop blur.
  Translucent controls over a star field read as see-through.
- **Realistic content**: real place names and coordinates that match the pose, never invented
  ones. A mock once showed "Frederiksberg" with no data behind it, and the owner asked where it
  came from.

## Poses

- Fly there in the browser and press `l`: the console logs `[engine] share URL:` with its
  `pose=`. The Debug panel's camera section has a copy-URL button for the same link.
- Or reuse a known one: `SONDERMARKEN_POSE` in `src/data/animation/clips/sondermarkenFlyout.ts`,
  `focus=body-earth`, or a sky pose `pose=k,earth,<lonRad>,<latRad>,<azRad>,<altRad>&t=<ISO>`.
- Don't hand-build a `b,` pose. A hand-built one faced into space on the first try. Its layout is
  `b,<body>,<anchor m ×3>,<eye − anchor m ×3>,<right ×3>,<up ×3>,<forward ×3>`: body-fixed axes,
  orthonormal, forward is the view direction (`encodeFramedPose` / `decodeFramedPose`).

## Showing the owner

- All variants go in ONE dash `ask_user` `choice` with `images`: one image per variant, labelled
  with a short name, plus a recommendation and its why. The owner keeps the verdict.
- Never a whole page as a check question. Viewport shots are fine; use a 1:1 crop when detail
  matters.
