# 13 - Award-level design, applied to Home-2

Subagent study and plan, 2026-10-30, branch `site/15-homepage`, for the restyle of Home-2 (`/home/home-2/`). Evidence key as in note 12: **[V]** page fetched this session through a summarising model · **[S]** search summary only · **[J]** my judgement, from sites seen before this session. No pixels of any winner were seen this session; the summarising fetches describe structure, not look.

## The plan

**Direction.** A measured universe, shown at rest. One pinned moment carries the page's boldness: in Stories the render fills the first screen beside the words and holds still while the tour and the exhibit scroll past, the part at the window's middle choosing the picture. Every other section is quiet, each with a rhythm of its own.

**Palette** (the site's tokens; nothing new): ground `#000` (`--color-bg`, true black) · title `#e8eeff` (`--color-fg`) · text `#dfe6fb` · muted `#c3cde8` · dim `#9aa7c9` · signal `#a8d0ff` (`--color-accent`), for links, the active marker and focus only.

**Type.** Cormorant Site 600 for titles, Jost for everything else, on the site's seven sizes. No new size: the title is `--text-h2` (up to 84 px) against 20 px body, about 4:1; h3 is set apart by face and colour, not size.

**Grid and rhythm, per section** (twelve columns, `--col-gap`):

```
Stories   |<-bleed  render, pinned (1-7)  | h2, lead           |   the bold place
          |                               | step: Long Way Out |
          |  label + markers              | step: Exhibits     |
Screens   |        h2, centred over the row, lead, link       |   symmetric lineup
          | phone | tablet |   desktop   |  dome |  (one floor line, labels hang from rules)
Lessons   | large (1-7)          |   | small (9-12), lower |  zigzag, crossing sides
          | small (1-5) |  | large (7-12), lower          |
RealData  | h2 (1-6)          | lead, link (7-12)          |   an index
          | sq | sq | sq | sq   (view links on one line)
          | measured | derived | drawn   <- edge to edge across the window
Sharing   | band (as built) ...                            |
          | part (1-5)        | part (7-12), taller        |
          | Open app, on the right part's last line         |
Credits   | Credits (1-3) | group (4-5) | name | licence    |   colophon
```

**Motion.** Only where it answers scroll or the pointer: the pinned picture and its crossfade, Open app's one-step states. `prefers-reduced-motion` removes the crossfade and the press; the pin is position, not motion.

## The plan reviewed against the generic defaults

- First draft had scroll fade-ups on every section: the generic default. Dropped; the only scroll-tied change is the pinned picture.
- First draft numbered the sections 01-05: the content is not a sequence. Dropped.
- First draft enlarged every h2: boldness spent everywhere is boldness nowhere. Kept at the token.
- First draft had a scroll-scrubbed scale on the pinned picture ("the camera drawing back"). Built, then removed as the one accessory: switched off, nothing was lost.
- No all-caps eyebrows, middle-dot meta strings, one-word accents, "→" links or tinted near-black ground anywhere.

## What the winners do

Sources read: Awwwards' space-tagged winners [S] https://www.awwwards.com/inspiration_search/space/ (Vast SOTD 2026-04-01, Cipher SOTD 2026-08-20); Oryzo AI by Lusion, Site of the Month April 2026 [S] https://www.awwwards.com/sites/oryzo-ai; Vast [V] https://www.vastspace.com/; Apple iPhone page [V] https://www.apple.com/iphone-17-pro/; a juror's 2026 list [V] https://www.hontran.dev/blog/best-award-winning-websites-2026; eight Three.js winners [V] https://www.utsubo.com/blog/best-threejs-websites-2026. Igloo Inc and Linear did not render through the fetch.

- **One hard idea, everything else budgeted around it.** Oryzo is one object lit and orbited; the Three.js survey's conclusion is "commit to one hard idea" [V]. Cartier's six alcoves: "one room per item beats one long scroll" [V].
- **Type scale.** Display at 4-6x body, set tight; body and captions small and quiet; the contrast between levels does the work, not colour [J, Apple, Linear].
- **Grid.** "A confident grid that breaks at exactly the right moments" (Uncommon Studio) [V]: text stays on the columns, one image per section breaks out to the window's edge.
- **Pacing.** Sections differ in length and density; a full-bleed band follows a dense grid; whitespace grows before a major section [V Apple].
- **Media.** Product renders bleed toward edges without frames [V Apple]; one pinned media moment while text scrolls is the signature move of product storytelling [J Apple, Stripe Sessions].
- **Scroll motion.** Transitions that "never call attention to themselves" (By-Kin) and act as "camera moves" [V]; performance is a criterion: "beauty that drops frames doesn't place" [V].
- **Details.** Captions under media in a small quiet face; numerals where they are data (Vast's specification list) [V]; links as plain underlined text or one kind of control [V Vast].

## Applied, section by section

- **Stories** pins its render for the first screen beside two scroll steps; an `IntersectionObserver` on the window's middle chooses the picture, only wide; the shared gallery hook gained an opt-in `auto = true` parameter so this one gallery never moves by itself.
- **Screens** centres its title over the lineup; each device's name and words hang from a hairline, as a picture's label does.
- **Lessons** sets a large and a small picture per row, crossing sides; the app's own controls, captured on a clear ground, lie over the renders they act on: the clock bar on the Jupiter film, the search panel over Orion, reaching past the picture's edge (decoration that earns its place: it shows the control the question is answered with); on a phone every render takes the window's width.
- **RealData**: the three kinds run edge to edge across the window; a new opt-in `foot` on `ShotCaption` puts the four tiles' view links on one line; the kinds' head is one left edge.
- **Sharing** sets Open app at the foot of the left column, level with the dated link.
- **Open app** (shared): opaque instead of glass, medium-weight label, one-step hover, a press, its own focus ring on a black band (note 12's findings 2 and 3; R1's light fill stays rejected).
- **Credits** (shared) is a colophon: title beside the sources, each source a row with name and licence.
