# UI and UX — the design standard

> **Applies to** any change a person sees or operates: the app UI (`src/components/`), the website
> and its docs (`packages/website/`), and dev-only overlays (`packages/website/src/dev/`).
>
> **Intent.** Every screen looks and behaves, in the owner's words, "as if a senior designer has spent
> actual time and effort in designing them": a person can tell what state it is in, what they can do
> next, and how to take it back.

It exists because UI work here was briefed in prose and checked with one desktop screenshot. The owner
asked: "do you consult a UI/UX document or just slop cannon UI in?" Every rule is a test. Bracketed
tags point at Sources; `[owner]` marks a ruling in the owner's words.

## How to design before building

Do these in order and keep the answers; the report quotes them.

1. **Name the person and the job** in one line: "As a … I need … so that …". It states a problem, not a
   solution. If you cannot write it, ask. [GOVUK-needs]
2. **Find its place.** Say where it goes on the existing screens and which control it sits beside. No
   place means no feature yet: stop and ask. [GettingReal]
3. **Inventory the states**: ideal, empty, loading, partial, error; then zero, one and many items;
   then the shortest and the longest real content. Each gets a designed answer. The empty state says
   what this is and gives the next step. [UIStack, GettingReal, NN-empty, Vercel]
4. **Sketch two or three layouts** in words (places, controls, what leads where), pick one, and write
   the reason against the job. One candidate is not a choice. [ShapeUp, NN-parallel]
5. **Build**, the centre first: the one part the screen cannot live without, before the rest. [GettingReal]
6. **Screenshot at 1728 and 400 wide**, every state, and look at each image.
7. **Critique against step 1**, not against taste: one pass per section of this file. Rate each finding
   cosmetic, minor, major or blocking; fix major and blocking. [NN-critique, NN-severity]
8. **Remove one thing.** Take out one label, border, control or sentence. If nobody would ask where it
   went, it stays out; repeat until something is missed. [Rams, GOVUK-principles, NN-10]

## Design brief template

A controller fills this when dispatching UI work; an implementer who gets a brief without it asks.

```
Person and job: As a <who> I need <task> so that <reason>.
Surface: app HUD | website | docs | dev overlay; sits beside <existing control>.
States: ideal, empty, loading, partial, error; zero/one/many; shortest and longest content.
Actions and keys: <action> → <visible result> → <way back>; shortcuts and where they are shown.
Must not cover: <named panels, bars, sidebars>.
Widths: 1728 and 400; touch yes/no.
Out of scope: <what not to add>.
Report: docs/superpowers/conventions/ui-ux.md self-check, two screenshots per state, one line per check.
```

## Interaction

1. **The state is on screen.** Every mode, toggle, selection and pending save has an indicator near
   the thing it describes. Test: from a screenshot alone, name the mode and whether the last change
   saved. [NN-10, NN-status, HIG-feedback]
2. **Every action answers at once.** Something visible changes within 0.1 s. A wait over 1 s shows a
   moving indicator with words; over 10 s, progress and a way to stop. No spinner under 1 s.
   [NN-response, NN-progress]
3. **Every control has all its states**: rest, hover, focus, pressed, disabled, and loading where it
   waits. A loading button keeps its label. Hover styles sit behind `@media (hover: hover)`.
   [NN-buttons, HIG-buttons, Vercel, Rauno]
4. **Every action can be taken back.** Prefer undo, or a state that cycles back, over a confirmation.
   Test: after any one click or key there is a one-step way back. [NN-confirm, NN-10]
5. **No modal unless data would be lost.** A dialog that demands an answer is for unexpected,
   irreversible loss. Never two at once. Panels do not dim or block the page. [NN-confirm, NN-modal, HIG-modality]
6. **Keys and actions are shown where they are used.** A shortcut is printed on its control or in the
   tool's bar, dim, always there; never only in a tooltip or a doc. An icon has a visible label unless
   its meaning is universal. Why: "I will forget the shortcuts, need to be reminded in a subtle way."
   [owner, NN-recall, NN-icons]
7. **One way to do a thing: one tool, one key, one bar.** A second overlay, mode or toolbar for a
   neighbouring job is folded into the first. Why: "they should be folded together. this is confusing
   now." [owner, NN-10]
8. **Escape cancels, Enter confirms.** Escape closes the innermost open thing; Enter commits
   (⌘/Ctrl+Enter in a multi-line field). Standard keys keep their meaning. Single-letter shortcuts are
   ignored while typing and with a modifier held; in shipped UI they can be turned off. [HIG-keys, WCAG 2.1.4]
9. **The next key works after a panel closes.** On open, focus moves into the panel; on close it goes
   back to the control that opened it. The focus ring is visible, never hidden behind a bar, never
   trapped. Test: open, close, press the next shortcut, mouse untouched. [APG-dialog, WCAG 2.4.7, 2.4.11, 2.1.2]
10. **Nothing blocks the next action.** Saves run in the background; an animation never has to finish
    first; a click elsewhere dismisses and keeps what was typed. [HIG-motion, HIG-loading]
11. **Errors sit beside their cause, in plain words, with the fix.** Never "An error occurred",
    "invalid", or a code. What the person typed is kept. Status text has `role="status"`, errors
    `role="alert"`. [NN-errors, WCAG 4.1.3]
12. **Colour is never the only signal.** State also changes shape, text, weight or position. [WCAG 1.4.1, HIG-color]
13. **Tooltips add, never carry.** Nothing needed for the task lives only in one. A custom one opens
    on hover and focus, stays while pointed at, and closes on Escape. [NN-tooltips, WCAG 1.4.13]
14. **It works at phone width and by touch.** At 400 px nothing overflows sideways, overlaps or falls
    off screen. Targets are at least 24 × 24 CSS px with that much room; primary controls 44 px (the
    site's `--tap`). Hover is never the only way in; a drag has a click alternative. Text inputs are
    16 px or more. [WCAG 1.4.10, 2.5.8, 2.5.7, HIG-buttons, Vercel]

## Layout, type and colour

- **Dark only.** Background `--color-bg`, `color-scheme: dark`. A raised surface is lighter than what
  is under it; text is never pure white. [HIG-dark]
- **No colour, size or space without a token.** App and site share `src/styles/tokens.css`; the site
  adds `--site-*` in `packages/website/src/styles/site.css`. A raw hex, rgba or px gap in a component
  is a finding. Every gap comes from the `--space-*` scale. [GOVUK-spacing]
- **Space shows grouping.** Related things are closer to each other than to anything else; a border or
  panel is added only when space cannot do it. Edges align to a shared line. [NN-proximity, NN-region, HIG-layout]
- **Hierarchy by weight and colour before size.** At most three text sizes in one view; secondary text
  takes a dimmer `--color-fg-*` token, not a smaller size. Weight does not change on hover or
  selection. Numbers that update use `tabular-nums`. [NN-visual, Rauno]
- **Contrast.** Text is 4.5:1 or more against what is behind it, the dim tokens included; control
  borders, icons and focus rings 3:1. Over the canvas or an image, measure against the brightest pixel
  behind and add a scrim if it fails. [WCAG 1.4.3, 1.4.11, NN-overimage]
- **Site typefaces.** Display `--font-family-display` (Cormorant, weight 600), body `--font-body`
  (Jost Variable), keys and code `--font-family-mono`. No fourth face. Weight 300 only at
  `--text-body` and larger; smaller text is `--weight-small` (400). [HIG-type]
- **App typefaces.** Panels and readouts `--font-family-mono` on the `--font-size-*` scale; titles
  `--font-family-display`; Sora is `ExhibitOverlay`'s alone. New text a person must read is
  `--font-size-sm` (10 px) or larger. [HIG-type]
- **One measure.** Prose is `--measure` wide, a lead `--measure-lead`; no third width. Line height
  from `--leading-body`. All caps only for labels under one line, letterspaced 0.05–0.12em.
  [Butterick, Bringhurst]
- **Icons match**: one size, one stroke weight, one level of detail per set; an icon-only control has
  an `aria-label`. [HIG-icons, Rauno]
- **App components** follow the `create-component` skill.

## Motion

- **Motion has a job**: feedback, a state change, or showing where something came from. Otherwise
  none, and none on actions repeated many times a minute. [NN-motion, HIG-motion]
- **Short.** Feedback about 100 ms; a panel in 200–300 ms and out faster; nothing past 500 ms. Entering
  eases out, leaving eases in. [NN-duration, Material-motion]
- **Animate `transform` and `opacity` only**; never `transition: all`. [WebDev-anim, Vercel]
- **Optional.** Each animation has a `prefers-reduced-motion: reduce` branch that removes it or
  replaces movement with a fade; nothing depends on having seen it. Anything that moves on its own
  for more than 5 s can be paused. [WCAG 2.3.3, 2.2.2, MDN-motion]

## Copy

The first six are the owner's rulings; the rest come from the sources, where the owner has not ruled.

- **Literal and short.** Say what the thing is or does. No metaphors: "no LLM-style metaphors". [owner, GOVUK-style]
- **No "not X but Y".** State Y. **No side remarks**: a clause not needed to act is cut. [owner]
- **No counts that go stale.** "The catalogs", not "three catalogs", unless the number is computed. [owner]
- **No dates in titles** unless the date is what the reader is looking for. [owner]
- **Tables hold phrases, not sentences.** No full stop in a cell. [owner]
- **The product name is lower-case `skymap`**, also at the start of a sentence. [owner]
- **A button says what it does**, verb first: "Save note", not "OK". A link names its destination,
  never "click here" or "learn more". [HIG-writing, NN-ok, WCAG 2.4.4, Google-style]
- **Sentence case** for headings, labels and buttons; no final full stop on a heading. One
  grammatical form per heading level. [MS-style]
- **The key word comes first** in headings, links and list items. [NN-first2]
- **The reader's words**: no type names, file names or plan jargon; no "we", "please", "oops". [NN-10, HIG-writing, GOVUK-style]
- **Every field has a visible label** outside it; a placeholder is an example, never the label. [NN-placeholder]

## Per surface — only what differs

**App HUD (panels over the canvas).** The canvas is the content.

- Panels sit at the edges and never cover the selected object; one `InfoCard` at a time. [GMaps-info]
- A panel opens and closes from the same control, and is never modal on a wide screen. [OpenSpace, NN-modal]
- Each readout or widget you add can be turned off on its own, and the whole HUD hides with one key. [Cesium, OpenSpace]
- On a phone, HUD elements stay inside the safe-area insets and reflow instead of overlapping. [GMaps-controls, Unity-safe]

**Website (landing and long pages).**

- A section's first sentence states its point; a heading says what the reader gets. [NN-scan]
- The sticky `Nav` stays compact and opaque; nothing you add makes it taller. [NN-sticky]

**Docs.**

- The "on this page" list repeats the section headings word for word and marks the current one. [NN-toc]
- One `h1`, no skipped levels, no link inside a heading; every heading has a stable anchor. [Google-style, WTD]
- A table is for items with three or more attributes; header cells are `th`, no merged cells. [Google-style]

**Dev overlays.**

- **The tool never sits in the flow of the content it acts on.** Its controls live in a side panel or
  bar, opened from a small icon beside the section. Why: the owner wanted it "instead of having it
  within the flow of the page". Test: with the tool on and its panel closed, the text and line breaks
  match the tool off. [owner, Hypothesis, Notion, GDocs]
- A note and its passage point at each other: selecting either marks the other. [Hypothesis]
- Each item shows its status; one toggle shows the page as it reads after the changes. [GitHub-review, Word, GDocs]
- **It never ships.** Mounted under `import.meta.env.DEV`, with its code imported behind the same flag
  (see `packages/website/src/dev/review/DevReview.astro`). [owner]

## Before you commit

1. Screenshot at **1728 wide and 400 wide**, every state from the inventory, and look at each image.
   App: `npm run shot -- '<link>' --url <your server> --size 1728x1000`, then `--size 400x850`. Site
   and overlays: headless Chromium at the same two viewports.
2. In both widths: every key and action is visible on screen (Interaction 6).
3. In both widths: nothing you added covers existing UI. Site: `Nav`, the left `DocsNav` sidebar, the
   right "on this page" list (`.toc`), `SectionNav`. App: `SettingsPanel`, `NavigationPanel`,
   `InfoCard`, `StatusBar`, `TimeBar`. "Known overlap" is not a pass.
4. Escape, Enter and the next shortcut tried in every state, keyboard only; the focus ring seen.
5. Each action tried, then taken back. Each error forced once and read.
6. Empty, loading and longest-content states seen, not assumed. Reduced motion on: still usable.
7. Dev overlay: `npm run site:build`, then search the build output for its class prefix (`fb-`,
   `review-`). Zero hits.
8. Copy read once against each copy test; one thing removed (the last step of the process).

## Briefing

Every brief for UI work cites this file by path and carries the filled design brief template. The
report returns the person-and-job line, the layouts considered with the reason for the pick, the two
screenshots per state, and one line per self-check item with what was seen. Without them it is not done.

## Sources

Only pages that were fetched and read. Apple pages were read through their `developer.apple.com/tutorials/data/…json` form.

- [NN-10] NN/g, 10 Usability Heuristics — https://www.nngroup.com/articles/ten-usability-heuristics/
- [NN-recall] [NN-status] [NN-confirm] [NN-modal] NN/g — https://www.nngroup.com/articles/recognition-and-recall/ · https://www.nngroup.com/articles/visibility-system-status/ · https://www.nngroup.com/articles/confirmation-dialog/ · https://www.nngroup.com/articles/modal-nonmodal-dialog/
- [NN-response] [NN-progress] NN/g — https://www.nngroup.com/articles/response-times-3-important-limits/ · https://www.nngroup.com/articles/progress-indicators/
- [NN-buttons] [NN-tooltips] [NN-errors] NN/g — https://www.nngroup.com/articles/button-states-communicate-interaction/ · https://www.nngroup.com/articles/tooltip-guidelines/ · https://www.nngroup.com/articles/error-message-guidelines/
- [NN-icons] [NN-proximity] [NN-region] [NN-visual] [NN-overimage] NN/g — https://www.nngroup.com/articles/icon-usability/ · https://www.nngroup.com/articles/gestalt-proximity/ · https://www.nngroup.com/articles/common-region/ · https://www.nngroup.com/articles/principles-visual-design/ · https://www.nngroup.com/articles/text-over-images/
- [NN-motion] [NN-duration] NN/g — https://www.nngroup.com/articles/animation-purpose-ux/ · https://www.nngroup.com/articles/animation-duration/
- [NN-empty] [NN-parallel] [NN-critique] [NN-severity] NN/g — https://www.nngroup.com/articles/empty-state-interface-design/ · https://www.nngroup.com/articles/parallel-and-iterative-design/ · https://www.nngroup.com/articles/design-critiques/ · https://www.nngroup.com/articles/how-to-rate-the-severity-of-usability-problems/
- [NN-ok] [NN-first2] [NN-placeholder] [NN-scan] [NN-toc] [NN-sticky] NN/g — https://www.nngroup.com/articles/ok-cancel-or-cancel-ok/ · https://www.nngroup.com/articles/first-2-words-a-signal-for-scanning/ · https://www.nngroup.com/articles/form-design-placeholders/ · https://www.nngroup.com/articles/how-users-read-on-the-web/ · https://www.nngroup.com/articles/table-of-contents/ · https://www.nngroup.com/articles/sticky-headers/
- [WCAG n.n.n] W3C, WCAG 2.2 and its Understanding pages — https://www.w3.org/TR/WCAG22/ · https://www.w3.org/WAI/WCAG22/Understanding/
- [APG-dialog] W3C, ARIA Authoring Practices, Dialog (Modal) — https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- [HIG-*] Apple Human Interface Guidelines: keyboards, modality, feedback, buttons, motion, loading, writing, color, dark-mode, layout, typography, icons — https://developer.apple.com/design/human-interface-guidelines/
- [Material-motion] Material Components Android, Motion (the m3.material.io pages could not be read) — https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md
- [MDN-motion] MDN, prefers-reduced-motion — https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- [WebDev-anim] web.dev — https://web.dev/articles/animations-guide
- [Butterick] Practical Typography, Line length, Line spacing, Letterspacing — https://practicaltypography.com/line-length.html
- [Bringhurst] The Elements of Typographic Style Applied to the Web, 2.1.2 — https://webtypography.net/2.1.2
- [GOVUK-spacing] [GOVUK-needs] [GOVUK-principles] [GOVUK-style] GOV.UK — https://design-system.service.gov.uk/styles/spacing/ · https://www.gov.uk/service-manual/user-research/start-by-learning-user-needs · https://www.gov.uk/guidance/government-design-principles · https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/a-to-z-style-guide/
- [UIStack] Scott Hurff, The UI Stack — https://www.scotthurff.com/posts/why-your-user-interface-is-awkward-youre-ignoring-the-ui-stack/
- [GettingReal] [ShapeUp] Basecamp — https://basecamp.com/gettingreal/getting-real.pdf · https://basecamp.com/shapeup/1.3-chapter-04
- [Rams] Vitsoe, Good design — https://www.vitsoe.com/us/about/good-design
- [Vercel] [Rauno] Web Interface Guidelines — https://vercel.com/design/guidelines · https://interfaces.rauno.me/
- [MS-style] [Google-style] [WTD] Microsoft Style Guide, Headings; Google developer documentation style guide; Write the Docs — https://learn.microsoft.com/en-us/style-guide/scannable-content/headings · https://developers.google.com/style/headings · https://www.writethedocs.org/guide/writing/docs-principles/
- [GMaps-info] [GMaps-controls] [Cesium] [OpenSpace] [Unity-safe] — https://developers.google.com/maps/documentation/javascript/infowindows · https://developers.google.com/maps/documentation/javascript/controls · https://cesium.com/learn/cesiumjs/ref-doc/Viewer.html · https://docs.openspaceproject.com/latest/getting-started/orientation/index.html · https://docs.unity3d.com/ScriptReference/Screen-safeArea.html
- [GDocs] [GitHub-review] [Hypothesis] [Notion] [Word] — https://support.google.com/docs/answer/6033474 · https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/commenting-on-a-pull-request · https://web.hypothes.is/help/annotation-basics/ · https://www.notion.com/help/comments-mentions-and-reminders · https://support.microsoft.com/en-us/office/track-changes-in-word-197ba630-0f5f-4a8e-9a77-3712475e806a
