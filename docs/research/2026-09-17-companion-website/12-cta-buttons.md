# 11 - The primary button

Subagent research, 2026-10-30, against branch `site/15-homepage`, for the one solid control on the site: `OpenApp` (`packages/website/src/components/shared/links/OpenApp/OpenApp.module.css`). The goal is craft rather than decoration. The owner rejected three ornamental concepts (a zooming galaxy ring, a drifting cosmic-web window and an orbiting point), so this note only refines today's pane.

Evidence key: **[C]** read from the site's shipped CSS, fetched with curl this session (class names are hashed and the files will rotate; the link is the page that loads them) · **[V]** page fetched this session through a summarising model · **[S]** search summary only · **[J]** my judgement. Contrast ratios are WCAG 2 relative-luminance values, computed in a script for this note.

Not obtained, so not used: Raycast (the hero button is rendered client-side and its CSS was not identifiable), SpaceX (button styles sit in lazy-loaded Angular chunks), ESA (not attempted), Material's state-layer page and Apple's HIG page (rendered by JavaScript; Apple came from its JSON feed, Material from a search summary). No pixels of any site were seen.

## 1. Nine primary buttons

| Site | Shape, size, padding | Type | Fill and contrast | Icon | Hover · active · focus | Over a picture |
|---|---|---|---|---|---|---|
| [Linear](https://linear.app) [C] | Pill (`9999px`); hero 44 px tall, `0 20px`; nav 32 px, `0 12px` | 16 px, weight 510 | Inverted on dark: fill `#e5e5e6`, text `#08090a` | 18 px slot, gap 6 px | Hover: fill becomes `#fff`. Active: `scale(.97)`. Transition `.16s cubic-bezier(.25,.46,.45,.94)` on background, colour, shadow and transform. Focus: 2 px ring, 2 px offset | Its secondary style is the glass one: translucent fill, `blur(4px)` and `box-shadow: 0 0 0 1px #0009, 0 4px 4px #0000001a`. The dark hairline disappears against black and outlines the button against a bright picture |
| [Vercel](https://vercel.com) [C] | Hero pill (`rounded-full`), 40 px, about 20 px each side (14 + 6); nav 32 px with an 8 px corner | 16 px / 24 px, medium | Solid gray-1000 (white in the dark theme), dark text | none | Hover: fill steps to `hsl(0 0% 80%)` in the dark theme. Transition 150 ms ease-in-out. Focus: `0 0 0 2px <page>, 0 0 0 4px <blue>`, so the ring always sits on a band of the page colour | not observed |
| [Stripe](https://stripe.com) [C] | 4 px corner; 24 px inline; vertical padding 15.5 / 16.5 px (about 48 px tall) | 16 px, weight 400–500, tracking 0, **`text-box: trim-both cap alphabetic`** | Solid brand purple, white text | A 5×8 chevron after the label | On hover the chevron moves 6 px and grows a shaft; colour changes take `.3s cubic-bezier(.25,1,.5,1)`. Focus: 3 px soft outline, 1 px offset | not observed |
| [Apple, MacBook Pro](https://www.apple.com/macbook-pro/) [C] | Pill (`980px`). The default is padded 9/16 at 14 px; "elevated" 12/22 at 17 px; "super" 18/31 at 17 px, about 56 px tall | SF Pro Text 400, tracking −0.016 to −0.022em | Blue `#0071e3`, white text. The dark-page neutral is `#f5f5f7` with black text | none | Hover changes the fill by one shade (`#0071e3` to `#0076df`); active `#006edb`. Focus: 2 px outline, 3 px offset | A `.button-blur` variant sets `backdrop-filter: blur(20px)` |
| [Framer](https://www.framer.com) [C] | 8 px corner, padded 10/14, at most 35 px tall | Inter 14 px, `wght` 540, −0.02em | White fill, black text, a token box-shadow | none | not readable (Framer runtime) | not observed |
| [Arc](https://arc.net) [C] | 12 px corner, 60 px tall, `0 24px` | 18 px, −0.02em | White fill, black text | 22×18 px, gap 12 px, filtered to black | Colour transition `.2s ease`. The outline button next to it fills dark on hover and on focus | not observed |
| [Teenage Engineering](https://teenage.engineering) [C] | Height is 5.1 % of the window width (desktop) and fills its column; padding `0 1em`; the field corner radius | 15/20/30 px steps | Solid black, white text | none | Hover is `opacity: .7`, with no transition | not observed |
| [NASA Eyes](https://eyes.nasa.gov) [C] | No box: bold text and a circle with an arrow in it | Inter 1.4 rem, weight 700 | White text; red circle `#f64137` | The circle *is* the affordance | On hover the circle darkens to `#b60109` and the text goes to `#d1d1d1`, `.2s ease` | The section supplies its own dark ground (`color-mode-dark`) |
| [Planetary Society](https://www.planetary.org) [C] | 4 px corner, padded 12/32 | Uppercase, +0.025em | Solid blue or orange, white text | none | Hover darkens the fill; `transition: all .2s ease-in-out .1s`, so the change only starts after 100 ms | not observed |

Patterns across the nine [J]:

- **The primary button is opaque and high in contrast.** Eight of the nine fill it solidly. Five of them use the inverted fill, a light block with dark text on a dark page (Linear, Vercel, Framer, Arc, and Apple's dark neutral). None of them uses a translucent tinted pane for its primary button. That treatment is exactly what Linear's *secondary* style and Apple's `.button-blur` are.
- **The label is medium weight with neutral tracking.** Weights run 500 to 540 (Linear 510, Framer 540, Vercel medium, Stripe up to 500). Tracking runs from 0 to −0.022em. The one site with positive tracking and capitals is the most template-like of the set (Planetary Society).
- **Height and padding.** Inline padding is 0.40 to 0.55 of the height: Arc 24/60, Linear 20/44, Stripe 24/48, Vercel 20/40, Apple super 31/56. Hero buttons are 40 to 60 px tall and nav buttons 32 to 35 px.
- **State changes are small and quick.** Each hover changes one property by one step: Apple one shade, Linear to `#fff`, Vercel to 80 % grey. Transitions run 150 to 200 ms (300 ms at Stripe), and active states scale or shade at once. Nothing moves inside a button at rest. The only motion in the set is Stripe's 6 px chevron, which plays on hover.
- **Focus is a ring separated from the button.** Vercel draws the ring on a band of the page colour, which keeps it visible over any background.

## 2. What the guidance says

| Principle | Source |
|---|---|
| A page has one true primary action. "Primary actions should be obvious. Solid, high contrast background colors work great here." Secondary actions use "outline styles or lower contrast background colors". | Refactoring UI, *7 Practical Tips for Cheating at Design*, tip 7 [S] https://medium.com/refactoring-ui/7-practical-tips-for-cheating-at-design-40c736799886 (HTTP 403 on fetch) |
| "Use a button that has a prominent visual style for the most likely action in a view"; keep prominent buttons to "one or two per view"; "Use style — not size — to visually distinguish the preferred choice." Hit region "at least 44x44 pt". | Apple HIG, Buttons [V, JSON feed] https://developer.apple.com/design/human-interface-guidelines/buttons |
| Keep a recognisable shape: "Retain the rectangular shape (preferably with rounded corners)". In tests, buttons with stronger visual definition drew more clicks. | NN/g, *Beyond Blue Links* [V] https://www.nngroup.com/articles/clickable-elements/ |
| Show pressed feedback "within 100–150ms". Hover is "a slight darkening of the background color" with a 150–200 ms delay. Mark focus with "the stroke or outline" rather than colour alone. | NN/g, *Button States* [V] https://www.nngroup.com/articles/button-states-communicate-interaction/ |
| A simple feedback animation should take about 100 ms; most UI animation falls between 100 and 500 ms. | NN/g, *Animation Duration* [V] https://www.nngroup.com/articles/animation-duration/ |
| Text over a picture needs a semi-opaque backing, a scrim, blur, or a shadow or outline, alone or combined. | NN/g, *Text Over Images* [V] https://www.nngroup.com/articles/text-over-images/ |
| A state is shown with a layer of the content colour over the button: +8 % for hover and +10 % for focus and press. That is one small step, not a new look. | Material 3, States [S] https://m3.material.io/foundations/interaction/states/state-layers · button specs https://m3.material.io/components/buttons/specs |
| Targets must be at least 24×24 CSS px (2.5.8, AA). | WCAG 2.2 [V] https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html |
| The parts of a control that identify it, and its focus indicator, need 3:1 against the colours next to them (1.4.11). A text label 20 px tall at weight 400 is not large text, so it needs 4.5:1 (1.4.3). | WCAG 2.2 [V] https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html · focus appearance https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html |
| `text-box: trim-both cap alphabetic` trims the font's space above the capitals and below the baseline, so the capitals sit in the true centre of the box. Browsers without support keep today's layout. | MDN [V] https://developer.mozilla.org/en-US/docs/Web/CSS/text-box-trim · in use at Stripe (above) |

Distilled for this site [J]: a premium button is **plain and exact, not decorated**. It has one opaque, high-contrast fill on a page that has no other fill, and a label at medium weight, optically centred. Each state changes one property by one step in 150 ms. The focus ring is drawn on a band of the page colour, so it shows over anything. What looks templated is a medium-contrast fill, tracked capitals, and a hover that only starts after a delay.

## 3. Today's pane, measured

Ground `#000`, text `#dfe6fb`, accent `#a8d0ff`. The fill is `color-mix(accent 14%, rgb(6 9 20 / .6))`, which is 66 % opaque, so whatever is behind the button shows through. The "white" row below is the worst case: a bright cloud or the face of the Moon. The "sky" row is a pale nebula, `rgb(150 180 220)`.

| Case | Label | Accent icon | Fill against what is behind it |
|---|---|---|---|
| Rest, on black | 12.9 : 1 | 10.0 : 1 | **1.31 : 1**. Only the 55 % border (3.25 : 1) marks the edge |
| Rest, on white | **3.49 : 1** (needs 4.5) | 2.72 : 1 | 4.36 : 1 |
| Rest, on sky | 5.16 : 1 | 4.02 : 1 | 3.02 : 1 |
| Hover (label `#fff`), on white | **3.61 : 1** | 2.26 : 1 | 3.62 : 1 |

Findings [J]:

1. **The pane is a secondary style by every system above.** It is the lower-contrast, outlined treatment that Refactoring UI, Apple (`button-secondary`) and Linear (`variant-secondary`) give to secondary actions. On black, its body barely separates from the page (1.31 : 1).
2. **On bright photographs the label fails 1.4.3.** At rest it reaches 3.49 : 1, and hover does not rescue it (3.61 : 1). The blur averages the picture but does not darken it.
3. **Focus shares the hover rule**, so a keyboard user's focus looks the same as a mouse hover. The site-wide accent outline is only 1.6 : 1 against a bright picture.

## 4. Three refinements

The three can be adopted separately and also combine. Each keeps the 4 px address-field corner (Stripe and Planetary Society use the same radius; a pill is equally well evidenced), the app icon, the label, the 56 px and 44 px heights and the 24/20 px padding. Those padding ratios (0.43 and 0.36) already sit in the references' range. Nothing animates at rest.

### R1 - Fill the button: an accent key with a dark hairline

```css
.root {
  border: 0;
  background: var(--color-accent);                                     /* was a 14 % tint */
  color: #060914;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.6), 0 4px 16px rgb(0 0 0 / 0.3); /* Linear's #0009 hairline */
  backdrop-filter: none;
}
.root svg { color: currentColor; }   /* the icon takes the ink, as Arc's does */
```

- **Why:** the site's only opaque light block becomes its only primary action, as Refactoring UI and Apple's "prominent style" describe. Every ring-marker link stays accent-coloured line work, so the button and the links stay distinct by kind as well as by size.
- **Contrast:** the label is 12.4 : 1. The fill is 13.1 : 1 against the page. Both are now independent of any picture behind the button.
- **Over a photograph:** the fill is opaque, so the label cannot drop. Against a bright cloud the fill alone is only 1.6 : 1. The 60 % black hairline supplies the edge: 3.6 : 1 against the fill and 5.7 : 1 against white, which meets 1.4.11. On the black page the hairline and the shadow are invisible. The blur is no longer needed.
- **Nav size:** use the same fill at 44 px. Per Apple, style rather than size marks the primary, so a filled button 44 px tall still outranks larger ring links. 44 px is Apple's minimum and nearly twice WCAG's 24 px.

### R2 - Set the label like a key cap: medium weight, no tracking, optical centre

```css
.root {
  font-weight: 500;                          /* was 400 */
  letter-spacing: 0;                         /* was 0.02em */
  text-box: trim-both cap alphabetic;        /* Stripe's optical centre; ignored where unsupported */
  gap: 0.5em;                                /* the icon gap scales with the label in both sizes */
}
```

- **Why:** every reference sets its primary label at 500 to 540 with tracking of zero or slightly negative. The site chose its 300 and 400 body weights for long passages of light text on black [J]; a short dark label on a fill reads better one step heavier. Trimming to the cap height centres the capitals in the box, which Linear's redesign calls work a user "would feel" (see note 12).
- **Contrast:** unchanged. Weight 500 at 20 px is still not "large text", so the 4.5 : 1 floor still applies. R1 gives 12.4 : 1; without R1, over a bright photograph, it stays at 3.49 : 1.
- **Nav size:** keep 16 px at weight 500. Below 900 px wide the site's body weight is already 400, so 500 stays one step above it.

### R3 - One-step states, a press, and a separate focus ring

```css
.root {
  transition: background-color 150ms cubic-bezier(.25,.46,.45,.94),
              transform 150ms cubic-bezier(.25,.46,.45,.94);   /* Linear's curve, Vercel's duration */
}
.root:hover { background: color-mix(in srgb, var(--color-accent), #fff 25%); } /* one step lighter */
.root:active { transform: scale(0.97); }                                       /* Linear */
.root:focus-visible {                                  /* its own rule, no longer shared with :hover */
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  box-shadow: 0 0 0 2px #000;                          /* Vercel: the ring sits on a band of the page colour */
}
@media (prefers-reduced-motion: reduce) { .root:active { transform: none; } }
```

- **Why:** each state changes one property by one step, like Material's 8 % layer, Apple's one shade and Linear's step to white. Hover lightens because on a black page lighter means nearer. A press responds at once (NN/g's 100 to 150 ms). No delay is added: this is one isolated button, so an accidental hover costs nothing, and of the nine sites only Planetary Society delays its hover. Focus gets its own appearance and is drawn on a black band, so it reads over any picture.
- **Contrast:** the hover label is 14.1 : 1 on `rgb(190 220 255)`. The focus outline against its black band is 13.1 : 1, which meets 1.4.11 and the 2 px perimeter of 2.4.13 (AAA) on any background.
- **Without R1:** the same rules apply to today's pane. The hover step stays today's tint change from 14 % to 28 %, and the focus band still fixes finding 3, but findings 1 and 2 remain.

Recommendation [J]: adopt all three. R1 alone fixes the measured failures. R2 and R3 are where the craft the owner asked for comes from, and together they change about a dozen declarations and add no markup.
