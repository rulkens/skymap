# 12 - Taste and structure

Subagent web research, 2026-10-05, against branch `site/01-foundation` at `201a16ea7` plus its uncommitted Home components. Builds on 06, 07, 08, 09 and 11 and does not repeat them; where this file disagrees with them or with the spec it says so.

Evidence key: **[V]** page fetched this session (through a summarising fetch model, no pixels seen, wording may be slightly off) · **[S]** search-result summary only, primary not opened · **[M]** from memory, not re-checked · **[J]** my judgement.

Not obtained, so treated as unverified wherever used: the Vignelli Canon PDF and Müller-Brockmann's book (quotes are from quote collections, [S]); Tufte's books (course notes, [S]); Refactoring UI's article (HTTP 403; the claim is from a search summary); Diátaxis "complex hierarchies" (HTTP 404 on fetch; search summary only); the EU "How to write clearly" booklet (secondary summaries); GOV.UK's sentence-length figure (not found, so not asserted); the Exploratorium (HTTP 403); Rijksmuseum (the fetch saw only thumbnails); Apple's dark-mode guidance (the fetch returned text that does not read like Apple's, discarded); the PNAS uncertainty paper (HTTP 403; figures from a search summary). No pixels of any exemplar were seen.

## 1. Taste in UI and UX

### 1.1 What the sources agree separates taste from polish

Polish is the absence of mistakes. The primary sources describe taste as something else: every element can state its reason, and the reasons belong to this subject and no other.

| Principle | Source | What it decides on a screenshot |
|---|---|---|
| Subtract until what is left is essential. "Less, but better – because it concentrates on the essential aspects, and the products are not burdened with non-essentials." | Rams, principle 10 [V] https://www.vitsoe.com/gb/about/good-design | Point at any element and ask what would be lost without it. "Nothing" means remove it. |
| Be honest. Good design "does not make a product more innovative, powerful or valuable than it really is." | Rams, principle 6 [V] same URL | A render that was retouched, a number without a source, a button that looks like more than a link: all fail. This is the owner's "real renders" rule stated as a design principle. |
| Be thorough. "Nothing must be arbitrary or left to chance." | Rams, principle 8 [V] | Two gaps that differ by 2 px, two near-identical type sizes, two blues: arbitrary. |
| Impact is not strength. Vignelli separates visual strength from visual impact and calls impact "usually vulgar and obtrusive"; he asks for work that is "semantically correct, syntactically consistent and pragmatically understandable". | The Vignelli Canon [S] https://www.rit.edu/vignellicenter/sites/rit.edu.vignellicenter/files/documents/The%20Vignelli%20Canon.pdf | "Stunning" has to come from what the picture shows. An effect added to make a section land (glow, parallax, gradient text) is impact. |
| Appropriateness: the solution comes from the particular problem. | Vignelli [S], same | The anti-template test. If a section's layout could hold another product's content unchanged, it was not designed for this one. |
| A system is an aid. "The grid system is an aid, not a guarantee." | Müller-Brockmann [S] https://www.goodreads.com/work/quotes/341206-grid-systems-in-graphic-design | Alignment to shared lines is checkable; a deliberate break is allowed once per page and must be obvious as deliberate. |
| "Be consistent, not uniform." | GOV.UK design principles [V] https://www.gov.uk/guidance/government-design-principles | The same thing looks the same everywhere; different things are allowed to differ. |
| "Do the hard work to make it simple." "This is for everyone… as inclusive, legible and readable as possible." | GOV.UK [V] same | The egalitarian benchmark: legibility and keyboard reach are part of taste, not a compliance pass afterwards. |
| The details nobody names are felt. Linear spent a redesign "aligning labels, icons, and buttons, both vertically and horizontally", work a user would "feel after a few minutes". Vercel: "Adjust ±1px when perception beats geometry." | [V] https://linear.app/now/how-we-redesigned-the-linear-ui · [V] https://vercel.com/design/guidelines | Ring and label optically centred; wordmark optically flush with the body text edge. |
| Above all else show the data; remove ink that carries no information. | Tufte, via course notes [S] https://faculty.cc.gatech.edu/~stasko/4460/Notes/tufte.pdf | For this site the "data" is the render. Chrome is non-data ink: every border, rule, scrim and label competes with stars. |

On the Nordic tradition, used carefully. The well-sourced part is public-sector: Norway's Designsystemet describes itself as "a shared toolbox of core UI components, guidelines, and patterns" for "consistent and recognizable user experiences" [V] https://www.designsystemet.no/en/ which is the same position as GOV.UK. The furniture tradition (Klint: function first, human proportion, honest materials) I found only on dealer and design-shop pages [S], so I use it as colour, not evidence. "Lagom" is not usable as a principle: the author of a book on it blames the international market for a clichéd craze, and a Scandinavian source rejects the "middle or average" reading in favour of "suitable in context" [S] https://www.thelocal.se/20170630/stop-this-is-what-lagom-truly-means-book-lola-akinmade-akerstrom . What survives is three decidable things: say what the material is (real renders, named surveys), build for the least advantaged reader first (old phone, second language, keyboard), and do not announce quality. I could not fetch IKEA's "democratic design" page (HTTP 404).

### 1.2 Restraint and richness on an image-led dark site

The owner wants "visually rich… stunning graphics". 07 already carries the counter-evidence (Tuch et al.: low visual complexity gives the best first impression). The two are compatible only under one rule: **the richness lives in the renders and the restraint lives in everything else.** Decidable forms of that rule:

1. One rich thing per viewport. A viewport holds one render at full strength; any second image is small, still and subordinate. [J from Rams 10, Tufte]
2. One accent. The ring blue is the only hue the site adds. The prototype's yellow parameter highlight in the address strip is a second accent; keep it only if it is the app's own syntax colour, otherwise use weight. [J]
3. One device per edge. An element gets a border or a scrim or a background tint, never two. The prototype's address strip has all three (fill, border, radius) and is the only boxed element on the page; that is acceptable as the single exception because it depicts a real browser field. [J]
4. No treatment on renders: no duotone, vignette, blur, glow, rounded-corner card or drop shadow. Crop and scale only. A circular mask is honest for the dome (fisheye output is a disc) and is a stylisation for the Places thumbnails; keep the latter only because it repeats the ring. [J from Rams 6]
5. Scrims exist only under text and are the minimum that reaches contrast (07 item 9).
6. Small multiples must be comparable. Tufte's small multiples work because every panel shares scale and framing [S]. The ten Places are a small-multiple set ordered by distance, which is good. The prototype then offsets every second item by 46 px, which adds a rhythm that means nothing and breaks the reading order on a two-column phone grid. Remove the stagger or make the offset carry the distance. [J]
7. Museum sites that hold authority run few top-level choices and let pictures go edge to edge: Louisiana has four navigation items ("Plan your visit", "Exhibitions", "What's on", "The Museum") over full-bleed images [V] https://louisiana.dk/en/ .

### 1.3 Rhythm and spacing

`site.css` says its values were "read off the accepted prototype": `--section-space: 9.375rem`, `--section-gap: 5rem`, `--stack: 1.625rem`, `--gutter: 2.75rem`, and components add their own (0.875rem, 1.875rem, 2.125rem, 5.5rem). Each is fine alone; together they are what Rams calls arbitrary. Recommendation [J; the constrained-scale idea is Refactoring UI's, [M]]:

- One spacing scale, each step visibly different from its neighbours: 4, 8, 12, 16, 24, 32, 48, 72, 112, 160 px. Every margin, gap and padding on the site is a step.
- Three rhythm rules that a reviewer can measure: space between sections is one constant; space inside a section is at most half of that; space between a heading and its text is smaller than the space above the heading (proximity).
- Phone values are the same scale shifted down by one or two steps, not a separate set.

### 1.4 Type scale, weight and measure for a light face on black

What the evidence says, including where it is against the directive:

- **Weight.** Refactoring UI rules out weights under 400 for interface text, with large headings as the exception, because of legibility at small sizes [S] https://medium.com/refactoring-ui/7-practical-tips-for-cheating-at-design-40c736799886 . Dark-mode practice is split: light text on dark looks slightly bolder (irradiation), so some advise trimming mid weights, while others report that thin and light cuts "vanish" and settle on regular or medium for body copy [S, design blogs] https://nerdy.dev/adjust-perceived-typepace-weight-for-dark-mode-without-layout-shift , https://designshack.net/articles/typography/dark-mode-typography/ . 07 adds that light-on-dark reading costs more as type shrinks. **The directive "body Jost 300" is supported only at large sizes.** The site currently sets Jost 300 at 15 px (`--text-small`, in the dimmest text colour, about 8.7:1 on black by my arithmetic, so it passes contrast and still has the thinnest strokes on the page).
- **Display face at control size.** Cormorant is published as "a free display type family" [V] https://github.com/CatharsisFonts/Cormorant . Its designer claims text-size legibility in print and on high-resolution screens; third-party reviewers put the x-height at 0.618 of cap height and a screen floor near 20 px because the hairlines thin out [S] https://www.behance.net/gallery/28579883/Cormorant-an-open-source-display-font-family , https://fontalternatives.com/fonts/cormorant-garamond/ . The site sets it at 18 px in the nav and small controls and about 17 px on the spine labels. On a dome operator's 1x office monitor or a classroom projector that is the least legible text on the site, and it is the navigation.
- **Measure.** Bringhurst: 45 to 75 characters, 66 ideal [V] http://webtypography.net/2.1.2 . Butterick: 45 to 90, or two to three alphabets per line [V] https://practicaltypography.com/line-length.html . `--measure: 44ch` is on the short side of that in a geometric face (the `ch` unit is the width of "0", wider than the average letter, so 44ch holds roughly 50 characters; not measured). Right for landing pages, too short for docs.

Rules [J, from the above]:

| Rule | Value |
|---|---|
| Jost 300 | Only at 20 px and above on desktop, 18 px on phones. |
| Anything smaller (captions, credits, footer, table cells, form hints) | Jost 400. |
| Docs body | Jost 400, 18 px minimum, line height 1.6 to 1.7, measure 60 to 70 characters (count them). |
| Cormorant 600 | Never below 20 px; below that the control label is Jost 400 with the same ring. |
| Sizes | Seven, on one ratio, named once: about 15, 18, 20, 24, 32, 48 to 56, and the fluid display size. Today the components use at least 13, 15, 17, 18, 19, 20, 21, 22, 23, 24, 26 px. |
| Display leading | 1.0 only for one-line display; 1.05 to 1.1 for headings that wrap, so descenders and accents ("Søndermarken", "Boötes") clear. |
| Numbers | `font-variant-numeric: tabular-nums` wherever figures are compared; a non-breaking space between number and unit (Vercel [V]). |
| Text colours | Three: primary, muted, dim. Dim is never used below 400 weight. |

### 1.5 Image treatment and captions

The best model in the domain is ESO: every image page gives a title, a plain-language caption, a "Credit:" line, an ID, a release date and the object's coordinates, and the licence requires the credit "clearly visible… not hidden or disassociated from the image" [V] https://www.eso.org/public/images/eso1907a/ , https://www.eso.org/public/outreach/copyright/ . ESO's captions run to about 280 words, which suits an archive page and not a landing page.

Skymap can do something no archive can: every picture is a state of the app and has an address. So the caption pattern is: **what it is · the simulated date if it matters · "Open this view" as a ring link to the same deep link the shot was made from · credit for any third-party imagery inside the render** (Earth imagery, planetary maps, galaxy photographs). The spec's shot manifest already stores `{ id, deep link, caption, alt }`; the recommendation is to print the deep link, not just store it. A scientist's check then costs one click, and "real renders" is proved, not asserted.

Decidable rules: no image without a caption except the hero; captions under 25 words (08's scroll-paced budget); caption text is Jost 400 at the small size, left-aligned to the image edge; alt text states what the picture shows, not that it is a screenshot (11 section 4.4).

### 1.6 Motion

The sources agree to an unusual degree:

- Animate by purpose and frequency. "Only animate to clarify cause/effect or add deliberate delight"; animations are interruptible; "never `transition: all`" (Vercel [V]). "Sometimes the best animation is no animation" (Kowalski [V] https://emilkowal.ski/ui/you-dont-need-animations ). 06 item 19 has Freiberg on the same point.
- Keep interface motion short: under 300 ms (Kowalski [V] https://emilkowal.ski/ui/7-practical-animation-tips ), under 500 ms "in most cases", `transform` and `opacity` only, decorative animation off under reduced motion (Stripe [V] https://stripe.com/blog/connect-front-end-experience ).
- Autoplay: "avoid autoplay except muted, non-essential loops; >5 second motion needs controls" (Vercel [V]; WCAG 2.2.2 in 07).

For this site [J]: the flight is the one piece of motion the page is about, so everything else stays still until touched. The prototype has three more autoplaying loops below the flight (tour, classroom, dome). Each needs a pause control under WCAG 2.2.2, and two can share a tall viewport. Recommendation: each loop plays only while it is the most visible media element, has the same pause control as the flight, and shows its poster otherwise. No scroll-triggered fade-ups anywhere (06 section D lists the single fade-up on every element as a templated tell). Hover changes are the ring only.

### 1.7 Mobile-first craft

- Targets: WCAG 2.5.8 (AA) asks for 24 by 24 CSS px or equivalent spacing [V] https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html ; Vercel asks 44 px on mobile and inputs at 16 px or more so iOS does not zoom [V]. The spine dots are 15 px; they pass only by the spacing exception and only while stops are far apart. Give each an invisible 24 px hit area.
- Vercel's device matrix includes iOS Low Power Mode, safe-area insets, and "never disable browser zoom" [V].
- **The phone currently gets the lesser page.** `Flight.astro` pins and scrubs only at 760 px and up; below that the hero is a 4:3 poster and the stops are a list. 06's top two patterns (the gesture is the quantity; the thing itself moving within the first second) are both absent on the device most curious visitors will use, and the owner's directive is that it "must look great on phones". NN/g's objection (07) is to altered scroll speed with text to read, not to motion on phones. A phone version that is its own design, not the fallback, is the single largest gap in the plan: for example a short portrait-cropped film that plays inline with the same HTML captions timed to it and a pause control, with the poster under data saver and reduced motion. [J]
- Check at 360 px wide and at 200% text zoom: no horizontal scroll, no clipped wordmark, nav disclosure reachable by keyboard.

### 1.8 Tells of templated or AI-generated pages (additions to 06 section D)

06 lists the visual ones. Three more that apply to the current build [J unless cited]:

- **Alternating image-left, image-right feature rows.** The prototype's `.row` and `.row.flip` (classroom, then dome mirrored) is the most common landing-page skeleton there is. It fails Vignelli's appropriateness test: the layout would hold any product. Each of those sections has a subject with its own shape (an address; a disc) that could set the layout.
- **A serif word over a full-bleed hero** is already named in 06 as a current vibe-coded tell, and it is exactly the Home hero. What separates this one is real footage, a wordmark and not a slogan, and one control. It stays defensible only while all three hold.
- **Uniform everything**: identical section padding, every heading the same size, every section "heading, paragraph, link". Vary section length and density with the content; a section that has one thing to say can be one line.
- For copy, the most complete public list is Wikipedia's: negative parallelisms ("not X, but Y"), copula avoidance ("serves as", "boasts", "features", "offers"), sentences ending in an "-ing" phrase that claims significance, title case headings, bold overuse, em dashes, vague attribution ("experts say"), and promotional stock ("vibrant", "rich", "showcasing", "nestled") [V] https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing . 08 bans most of these; the copy rubric below adds the rest.

## 2. Soul and quirk

### 2.1 Named examples and what exactly they do

| Site | What it does | Why credibility survives |
|---|---|---|
| NASA/JPL, Perseverance parachute [S] https://science.nasa.gov/resource/mars-decoder-ring/ | The canopy pattern encodes "DARE MIGHTY THINGS" and JPL's coordinates in binary. About six people knew before landing; the public decoded it in about six hours. | The pattern also did engineering work (it shows canopy orientation). The quirk is discoverable, true, and costs the mission nothing. The best model for an audience of scientists. |
| SQLite [V] https://www.sqlite.org/copyright.html | States that contributors' signed affidavits are "stored in a firesafe at the main offices of Hwaci". | Personality through an odd, exact, checkable fact. No joke is made. |
| Mullvad (Sweden) [V] https://mullvad.net/en/why-mullvad-vpn | "We don't ask for any personal info – not even your email." Admits what its product cannot do: "there is still a risk that your traffic can be analyzed." Says it avoids paid reviews and affiliates. | The voice is blunt refusal and stated limits. This is the Nordic register the owner describes, with no humour needed. |
| Bruno Simon (06, 08) https://bruno-simon.com | One aside: "And don't break anything!" | There is exactly one. |
| 100,000 Stars (06) | "an artist interpretation of space" | The honest aside is the personality. |
| Nadieh Bremer (08) | "I generally don't take on the creation of dashboards" | A refusal reads as a person with standards. |
| Craig Mod [V] https://craigmod.com/about/ | First person, gear and process details, short dry qualifiers ("sort of", "Who knows"). | The asides sit beside real credentials and never replace them. |
| Vercel [V] https://vercel.com/design/guidelines | Right-clicking the nav logo surfaces the brand assets. | A hidden touch that is useful to the one person who looks for it. |
| OpenSpace docs [V] https://docs.openspaceproject.com/ | A notice that sections range from "completely overhauled" to "untouched from the previous documentation version". | Candour about the state of the work, in a domain neighbour. |
| Oatly (Sweden), the cautionary case [S] https://tmla.co.uk/article/oatly-branding-strategy/ , https://www.contagious.com/en/article/news-and-views/campaign-of-the-week-oatly-publishes-website-compiling-all-its-controversies | Jokes on every surface. | Analysts report it reads as smug and "try-hard"; Contagious ties it to "wackaging", which it calls tiresome. Personality imposed on every reader, every time. |

### 2.2 Where the line is for scientists

NN/g's tone study is the only measured evidence I found: perceived trustworthiness explained 52% of a brand's desirability and friendliness 8%; a playful tone raised friendliness and lowered trust for insurance; "Humor is extremely risky" because it splits audiences and can bury the information [V] https://www.nngroup.com/articles/tone-voice-users/ . It was not run on scientists; the direction is the safe reading.

Rules that follow [J]:

1. A quirk is **true**. It is a fact about the project, the sky or the maker. Nothing is invented for charm.
2. A quirk is **found, not served**: a colophon, a 404, a caption, a footnote, a hover. Never the hero, never a heading that navigates, never a form, never a blocking error.
3. A quirk never touches a number, a unit, an attribution, a licence or a limitation. The "Known simplifications" page may be dry; it may not be funny about being wrong.
4. One per page at most. Removing it loses no information.
5. Self-directed only. The maker may be modest about the maker; never ironic about the science or the reader.

Candidates for skymap, each to be verified before use: a colophon on the About page (the two faces, that every picture was made by `npm run shot`, that the hero was recorded in the app); a 404 line such as "This page is not in any catalogue we use."; honest inventory lines taken straight from 09 ("Six small moons are plain grey spheres. We have no surface map for them." from row A21); a "last checked" date beside each sourced fact; the app's own ring as the cursor of attention and nothing else. The ring control and the spine already carry more soul than a joke would.

## 3. Taste in copy

### 3.1 Plain-language standards beyond 08

| Finding | Source | Consequence |
|---|---|---|
| Experts prefer plain English too: in a study of legal language 80% preferred clear English, and the preference grew with the complexity of the issue and the reader's expertise. | GOV.UK content guidance [S] https://www.gov.uk/guidance/content-design/writing-for-gov-uk (now at https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/tone-of-voice/clear-language ) | Supports 08 principle 9 with a number. The Science page is written as plainly as Home. |
| House rules with an egalitarian rationale: sentence case always; "and" not "&"; no "eg", "ie", "etc" (screen readers); no negative contractions (harder to process); ranges with "to"; dates as "2 June", no ordinals; avoid metaphor verbs ("drive", "tackle", "transform") and "hub", "portal". | GOV.UK A to Z style guide [V] https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/a-to-z-style-guide/ | Adopted in the addendum below. Vercel's guide asks for Title Case and "&" [V]; for this audience GOV.UK and Microsoft win. |
| Writing for second-language readers and machine translation: short subject-verb-object sentences; keep "that", "who" and articles; one term per concept; "limit your use of sentence fragments"; avoid idioms, colloquial expressions and culture-specific references; avoid phrasal verbs; "Avoid humor. Most humor is difficult to translate"; no seasons as dates. | Microsoft [V] https://learn.microsoft.com/en-us/style-guide/global-communications/writing-tips · Google [V] https://developers.google.com/style/translation | Two conflicts with 08. First, 08's best captions are fragments ("Three days by Apollo. 1.3 seconds by light."); keep them on Home where the picture carries the grammar, and write full sentences in docs and on the Science page. Second, "pull back" and "fly to" are phrasal verbs that are also the product's vocabulary; keep those two and avoid the rest. |
| The EU's ten hints: think first, reader focus, structure, short and simple, make sense, cut nouns for verbs, concrete over abstract, active verbs, beware false friends, jargon and abbreviations, revise. | European Commission, via summaries [S] https://translation.ec.europa.eu/languages-and-translation-european-commission/plain-language-making-european-commission-texts-clear_fr | The false-friends hint matters here: "billion" is 10^12 in Danish, Dutch and German everyday usage [M]. Gloss it once on any page that uses it. |
| Stating uncertainty as a numeric range barely moves trust in the source (4.58 against 4.55 for no uncertainty); vague verbal hedging lowered it (4.19 against 4.55). Five experiments, 5,780 people. | van der Bles et al. 2020, PNAS 117(14) [S] https://www.pnas.org/doi/10.1073/pnas.1913678117 | On science and data pages give the value with its error and source. Avoid "may", "could be", "is thought to" without a number or a reference. |

### 3.2 Dry understatement as a register

Mechanically, British and Nordic understatement is five different devices, and they do not carry equal risk:

| Device | Example | Literal reading | Verdict |
|---|---|---|---|
| Litotes (denying the opposite) | "The distances are not small." | Vague; a translator returns "the distances are medium". | Ban |
| Downtoner | "It is a fairly large place." "Quite good." | Reads as faint or moderate. | Ban |
| Level register over escalating content (Munroe, in 08) | "Voyager 1 has been travelling since 1977. It has covered less than a tenth of one per cent of the way to the nearest star." [verify the fraction] | True and complete as written. | Use |
| The exact mundane fact after a large one | "The Milky Way seen from outside is drawn from a model. Nobody has been outside to check." | True as written. | Use, sparingly |
| Self-directed modesty | "One person builds skymap, which explains the pace." | True as written. | Use off the landing pages only |

Why the split: irony and implied meaning are processed more slowly and less accurately in a second language, and ironic praise is the hardest case [S] https://www.sciencedirect.com/science/article/abs/pii/S0378216620302769 , https://www.tandfonline.com/doi/abs/10.1080/09658416.2023.2277777 . The widely circulated Anglo-Dutch table makes the same point informally: "not bad" is meant as praise and heard as poor; "quite good" is meant as mild disappointment and taken at face value. Its authorship is disputed and commenters contest some entries, so it is an illustration, not evidence [S] https://languagelog.ldc.upenn.edu/nll/?p=3154 . I found no study of understatement itself in second-language readers.

The test that makes the register safe: **read the line as a literal-minded translator would. If it is still true, still polite and still informative, it may stay.** A line that needs its tone to be understood is cut. This keeps the Nordic dryness (flat, exact, slightly withholding) and drops the British kind (meaning the opposite).

### 3.3 House-style addendum for 08

**Spelling.** British: catalogue, centre, colour, metre, programme (but "program" for software), -ise. Proper names keep their own spelling (Sloan Digital Sky Survey "Data Release", "Center for Astrophysics"). Code, URL parameters and file names are quoted as they are, in a monospace face. The repo's README says "catalog"; the site says "catalogue".

**Units.** Metric only on Home; no miles. A non-breaking space between number and unit, SI symbols unpluralised (5 km, 60 fps, 4 K is a temperature so write "4K film" only as the format name). Public pages use light-travel time and light-years; docs and Science pages use parsecs (pc, kpc, Mpc) and astronomical units with the light-year value in brackets on first use. Beyond a few hundred million light-years, say which distance is meant: the "46 billion light-years" on the Places card is a present-day (comoving) distance, while the captions beside it speak of how old the light is. An astronomer will check that those two are not mixed in one sentence.

**Dates and times.** "5 October 2026"; no ordinals, no seasons, no "last year". ISO 8601 with a Z inside links, tables and code. Anything that changes carries "as of" and a date (Voyager's distance, catalogue release numbers, browser versions).

**Numbers.** Numerals for anything measured or counted from data, always, including in headings. Words for one to nine elsewhere. Comma for thousands, point for decimals, "2.5 million" over 2,500,000. One number per sentence on landing pages (08). Round in prose and give the unrounded value in the linked fact. Where "billion" appears on a page, gloss it once as "thousand million" or 10^9. Ranges with "to". Never "exactly"; never a count the code cannot reproduce (09 marks which are unverified).

**Uncertainty.** Four words with fixed meanings, used consistently across the site: **measured** (an instrument recorded it), **derived** (computed from measurements by a stated method), **modelled** (a published model fills a gap), **drawn** (our own rendering choice). "About" and "roughly" mean rounding only. On Science and Data pages a quantity carries its error and its source in the same sentence. No hedge without a number or a reference.

**Jargon.** Gloss on first use on each page, in the same sentence, by apposition: "redshift, the stretching of light as space expands". Survey acronyms are expanded once per page (SDSS, 2MRS, GLADE, DESI). The gloss wording comes from one place (a glossary page, section 4) so that two pages never define a term differently. No "eg", "ie", "etc", "via", "vs".

**Sentences.** Full sentences with articles in docs. No negative contractions ("cannot", "do not"). Sentence case in every heading, label and link. Link text names the destination ("Controls reference"), never "here" or "learn more".

**Humour budget.** At most one dry line per page, and none on: the first screen of any page, navigation labels, headings, forms and their errors, data tables, attribution and licence text, the cite page, known simplifications. Every dry line passes the literal test in 3.2. If a reviewer has to ask whether a line is a joke, it is cut.

## 4. Site structure

### 4.1 What the evidence says

- **Diátaxis fits, as a sorting rule and not as labels.** Four needs, four forms: tutorials (learning), how-to guides (tasks), reference (lookup), explanation (understanding) [V] https://diataxis.fr/ . Its own guidance for larger sets is a landing page per section, lists of about seven items ("Seven items seems to be a comfortable general limit"), and an admission that topic areas cut across the four types [S] https://diataxis.fr/complex-hierarchies/ . Mapping: the spec's Guide is how-to, Reference is reference, Data is reference, Rendering and Science are explanation. The tree has no tutorial; it needs exactly one.
- **How good docs sites arrange themselves.** Astro: four tabs, Tutorial, Guide, Reference, Ecosystem, with search and a language picker [V] https://docs.astro.build/en/getting-started/ . Tailwind: Getting started, Core concepts, then reference groups; search on ⌘K; a section label above the page title in place of a breadcrumb trail [V] https://tailwindcss.com/docs/installation/using-vite . Stripe opens task-led ("Accept payments online") and only then offers "Browse by product" [V] https://docs.stripe.com/ . Blender: Getting Started, then sections by area of the program [V] https://docs.blender.org/manual/en/latest/ . OpenSpace: ten top-level sections including Getting Started, Using OpenSpace, Reference, Glossary, About [V]; ten is past the comfortable limit and it shows. Stellarium puts a one-sentence definition first and its academic citation on the homepage [V] https://stellarium.org/ . MDN not fetched.
- **Task-led over audience-led** is in 07 (NN/g). One refinement: the objection is to labels that name people ("For educators"), because visitors do not know which group they are in. A label that names a place ("Classrooms", "Domes and museums") does not have that problem.
- **Depth.** "Flat hierarchies tend to work well if you have distinct, recognizable categories"; either extreme backfires [V] https://www.nngroup.com/articles/flat-vs-deep-hierarchy/ . Three levels at most: docs, group, page.
- **Breadcrumbs** are unnecessary on sites one or two levels deep and must show hierarchy, not history [V] https://www.nngroup.com/articles/breadcrumbs/ . The docs are three levels, so a single section label above the title that links to the group index does the job; the `BreadcrumbList` JSON-LD in 11 can exist without a visible trail.
- **On this page** helps long pages and is clutter on short ones; on phones a collapsed list or accordion works better than a long page of jump links [V] https://www.nngroup.com/articles/in-page-links-content-navigation/ .
- **Footer.** Users go there on purpose for contact, company details and alternative routes, and "footers… will never get in the way of users who get their needs satisfied higher up". Useful components: utility links, doormat navigation, a site map for larger sites [V] https://www.nngroup.com/articles/footers/ .
- **Search** is how people take control and how they recover when lost; 51% succeed on the first query and 32% on the second [V] https://www.nngroup.com/articles/search-visible-and-simple/ . I found no page-count threshold below which search is unnecessary. Pagefind is static, needs no server, and reports "under 300kB" total payload for a 10,000-page site and nearer 100 kB for most [V] https://pagefind.app/ .
- **404.** A plain, slightly apologetic statement, likely corrections, and a search field [V] https://www.nngroup.com/articles/improving-dreaded-404-error-message/ .
- **URLs.** "A cool URI is one which does not change"; leave out status, authorship, file extensions, the software mechanism and anything else that will change [V] https://www.w3.org/Provider/Style/URI . The site is unindexed and unlinked today (11), so names are free to change now and costly after the root swap.
- **Clickability.** Weak signifiers cost 22% more time and 25% more fixations, except on pages with low density, conventional placement and high contrast; a contrasting colour is enough for inline links [V] https://www.nngroup.com/articles/flat-ui-less-attention-cause-uncertainty/ . The ring-and-label control meets those exceptions on landing pages. It does not cover links inside a paragraph, which docs will have by the hundred; those need the accent colour and an underline.

### 4.2 Proposed tree

**Top navigation** (wordmark links Home; four items; the launch control stays outside the phone disclosure, as built):

`Classrooms` · `Domes and museums` · `Science` · `Docs` · ring: `Fly it yourself`

Today's labels mix an imperative, a noun pair and two nouns ("Use it in a classroom", "Domes and museums", "Science", "Docs"). Parallel short nouns scan faster and the longest label drops from 21 characters to 17, which matters when the label is set in a display face. Home's section headings stay imperative, per the spec.

**Footer** (text links, not ring controls: sixteen rings in a row is noise, and the ring should mean "go to a place or into the app"):

| Use | Understand | Project | Fine print |
|---|---|---|---|
| Fly it yourself | Science | About and contact | Licence (MIT) |
| Take the tour | Data sources | Roadmap | Privacy |
| Classrooms | Known simplifications | Releases (GitHub) | Version and release date |
| Domes and museums | How it renders | Source code (GitHub) | |
| Docs | Cite skymap · Credits | | |

Plus one maker line. The current line, "skymap is made by Alexander Rulkens. We build it in the open", names one person and then says "we" in the next sentence; see change 12.

**Pages and URLs.** Bold marks a change from the spec, 09 or 11.

| URL | Page | Type |
|---|---|---|
| `/` | Home | landing |
| **`/classroom/`** (was `/educators/`) | Classrooms | landing |
| **`/domes/`** (was `/venues/`) | Domes and museums, with the form at `#contact` | landing |
| `/science/` | Science | landing |
| **`/about/`** | Who makes it, why, how to reach us, press images, colophon | new |
| **`/privacy/`** | What the form stores and for how long; no analytics | new |
| **`/404`** | Not found (11 section 3.4) | new in the page list |
| `/docs/` | What skymap is (the citable paragraph from 11) and a map of the docs | index |

**Docs sidebar**, seven groups, in this order:

| Group | Pages (URL slug under `/docs/`) | Diátaxis type |
|---|---|---|
| **Start** | **First flight** (`start/first-flight/`, the one tutorial: ten minutes from Earth to the cosmic web and back) · What is in the scene (`start/scene/`, from 09 A1 to A30) · Browser support and troubleshooting (`start/browsers/`, from 09 J1 to J10) | tutorial, explanation |
| Guide | Moving around (`guide/moving/`) · Finding things (`guide/finding/`) · Time (`guide/time/`) · Tours and exhibits (`guide/tours/`) · Sharing a view (`guide/sharing/`) · Info cards (`guide/info-cards/`) · Settings (`guide/settings/`) · Screens, quality and domes (`guide/screens-and-domes/`) | how-to |
| Reference | Controls (`reference/controls/`) · URL parameters (`reference/url-parameters/`) · Settings (`reference/settings/`) · Object catalogue (`reference/objects/`) · **Glossary** (`reference/glossary/`) | reference |
| Data | All sources at a glance (`data/`) · one page per source (`data/<short-name>/`, generated; no release number in the slug) · From catalogue to pixels (`data/pipeline/`) | reference |
| Science | Measured, derived, modelled, drawn (`science/`) · topic pages from `docs/science.md` (`science/<topic>/`; titles to be fixed from 05) · Known simplifications (`simplifications/`, 11's URL kept) | explanation |
| Rendering | The frame (`rendering/`) · topic pages from 04 (`rendering/<topic>/`) | explanation |
| Project | Roadmap (`roadmap/`) · Credits (`credits/`) · Cite (`cite/`) · **For developers**: workbenches (`developers/workbenches/`), command-line tools (`developers/cli/`), debug panel and flags (`developers/debug/`) | mixed |

Page furniture in the Docs layout: a group label above the title, linking to the group index; "On this page" only when a page has four or more second-level headings, collapsed on phones; previous and next within the group only, in the order above; "Sources" at the foot (generated from `facts.ts`, as specified); a "last checked" date; an "Open this view" link on every figure. Each reference table lives on one page so that the browser's own find works until search lands.

**Three most important onward links from each landing page**

| Page | 1 | 2 | 3 |
|---|---|---|---|
| Home | The app (`Fly it yourself`) | The tour deep link | `/science/` from the measured-and-drawn block |
| Classrooms | `/docs/guide/sharing/` (make a lesson link) | `/docs/start/browsers/` (will it run on school machines) | `/docs/simplifications/` (what is accurate enough to teach from) |
| Domes and museums | `/docs/guide/screens-and-domes/` | `/docs/credits/` (what may be shown in public, and with which credit) | `#contact` and `/about/` |
| Science | `/docs/data/` | `/docs/simplifications/` | `/docs/cite/` |
| Docs index | `/docs/start/first-flight/` | `/docs/reference/controls/` | `/docs/data/` |

Handoff rule [J]: a landing page makes a claim, shows one instance, and links down once; it never restates a table that the docs own. The spec's Science landing page lists "data sources at a glance", which is also the docs' `data/` index: render both from the same registry or the landing page links and does not list. Each docs page links back up to its landing page in its first paragraph, as the spec's cross-linking rule already requires.

### 4.3 Changes to the spec's page list, with reasons

1. `/educators/` becomes `/classroom/`. The spec's own call is "section names are tasks, not audiences"; the URL is the one place that still names an audience, and it cannot change cheaply after indexing.
2. `/venues/` becomes `/domes/`. "Venues" matches none of 11's likely queries (planetarium, dome, museum) and says nothing to a visitor reading the address.
3. Nav labels become parallel nouns (4.2).
4. Add `/about/`. 06 section C: a director expects "who is behind it, with a name and face"; funders, one of the five audiences, have no page at all; the spec publishes no email address, so a second route to the form is needed.
5. Add `/privacy/`. A contact form in the EU collects personal data and needs a statement of what is kept [M, not legal advice]. Saying "no analytics, no cookies" is also a credibility line in the Mullvad manner.
6. Add the 404 page to the page list (11 has it; the spec does not).
7. Add a Start group with one tutorial. Diátaxis: the tree has how-to, reference and explanation but nothing for the person who has never opened the app. 09's "Getting started and troubleshooting" splits into the tutorial and a browser-support page, because 08 and 11 both show that "will it run" is its own question.
8. Add a Glossary. The house style needs one source for glosses; OpenSpace has one; 11 section 4.4 wants definitional sentences that answer engines can quote.
9. Add 09's Tools and Developers pages, merged into one "For developers" subgroup under Project. The spec's docs list omits them; 09 open question 14 notes the workbenches have no front door. Kept out of the main groups so the sidebar stays at seven.
10. "What is in the scene" moves from Guide to Start. It is an overview, not a task, and Guide is at eight pages without it.
11. Data gets a pipeline page separate from the per-source pages, so each source page stays a fixed-shape record that can be generated.
12. Search moves from "not in this effort" into the docs slices (Pagefind). The object catalogue alone holds several hundred names (09 table d), and search is the documented recovery route.
13. A release date joins the version in the footer, and "Releases" links to GitHub. 06 pattern 8: liveness signals. No changelog page to maintain.
14. Per-source data URLs carry no release number (`data/sdss/`, not `data/sdss-dr17/`), per Berners-Lee.
15. Add a URL-stability test at the root swap: a committed list of published paths, each of which must resolve or redirect in the built site.

## 5. Taste rubric

Apply at 1440 px and 390 px wide. Each check is pass or fail; "n/a" only where stated.

### Design

| # | Check |
|---|---|
| D1 | Covering the logo, the page could not be mistaken for another product's: at least one element on screen exists only in skymap (the ring, a deep link, a real render). |
| D2 | Every image and video is a capture of the app. No illustration, stock, icon set or generated art. |
| D3 | No render has a filter, glow, vignette, shadow or rounded-corner card applied. |
| D4 | Each viewport has one dominant image; any other is still and clearly smaller. |
| D5 | At most one element is moving in any viewport when the pointer is idle. |
| D6 | Every moving element that runs longer than 5 seconds has a visible pause control. |
| D7 | With reduced motion set, nothing moves and no content is missing. |
| D8 | The page uses one accent hue. Count the distinct non-neutral colours outside images: one. |
| D9 | No element combines two of border, background tint and shadow, except the address strip. |
| D10 | No pill, no filled button, no gradient, no frosted panel, no icon in a tinted square. |
| D11 | Every navigational control is a ring plus label; every link inside a sentence is accent-coloured and underlined. Nothing else is clickable and nothing that looks like either is inert. |
| D12 | No text in the light weight (300) is smaller than 20 px at desktop width or 18 px at phone width. |
| D13 | No text in the display face is smaller than 20 px. |
| D14 | No more than seven distinct font sizes appear on the page. |
| D15 | Body lines hold 45 to 75 characters on desktop and at least 30 on a phone (count one full line). |
| D16 | Every heading that wraps has no clipped or touching ascenders, descenders or accents. |
| D17 | Text over an image meets 4.5:1 against the brightest pixel behind it (3:1 for text of 24 px or more). |
| D18 | Every vertical gap between blocks is a value from the spacing scale (measure three at random). |
| D19 | The gap above a heading is larger than the gap below it, everywhere. |
| D20 | The gap between sections is the same throughout the page, and larger than any gap inside a section. |
| D21 | Left edges: at most three distinct text left edges at desktop width, one at phone width. |
| D22 | Ring and label are vertically centred to within 1 px at every size. |
| D23 | No two consecutive sections share the same layout skeleton mirrored (image left, then image right). |
| D24 | Every image except the hero has a caption, and every caption has an "Open this view" link or a stated reason it cannot. |
| D25 | Every image containing third-party imagery shows its credit adjacent to the image, not only on the credits page. |
| D26 | Figures that are compared (distances, counts) align in tabular numerals, and no number is separated from its unit by a line break. |
| D27 | Phone: every tap target is at least 24 by 24 CSS px, and the primary action at least 44. |
| D28 | Phone: no horizontal scroll at 360 px, and none at 200% text zoom at 390 px. |
| D29 | Phone: the first screen shows the wordmark, the one-line claim and the launch control without scrolling, and something of the sky is visible behind or above them. |
| D30 | Phone: the hero conveys the pull-back itself (motion or a sequence), not a single still with a list. |
| D31 | Keyboard: tabbing from the top reaches the launch control within five stops and every control shows a visible focus ring. |
| D32 | The page reads correctly with the hero video blocked: poster, words and control are complete. |
| D33 | The footer shows the maker's name, the version with its date, the licence, and links to Docs, Cite, Credits, Privacy and the source. |
| D34 | Docs pages: the group label, title, "On this page" (if shown) and previous or next are present and none overlaps the text column at any width. |
| D35 | Nothing on the page fades, slides or scales into view on scroll. |

### Copy

| # | Check |
|---|---|
| C1 | The first sentence of the page says what the thing is, with the subject named, in under 16 words. |
| C2 | No word from 08's ban list, and none of: serves as, boasts, features (verb), offers, showcasing, vibrant, rich, crucial, key (adjective), landscape, testament. |
| C3 | No "not X but Y", no "not only", no "whether you are", no rhetorical question, no exclamation mark, no em dash. |
| C4 | No list of exactly three adjectives or three fragments. |
| C5 | No sentence ends in an "-ing" phrase that states a significance ("…, making it…", "…, showing how…"). |
| C6 | Every heading, label and link is in sentence case. |
| C7 | Every number has a unit, and every factual number resolves to a `facts.ts` row with a source. |
| C8 | No landing-page sentence contains two numbers. |
| C9 | Every technical term and acronym is glossed in the sentence where it first appears on the page. |
| C10 | Spelling is British throughout, except proper names and quoted code. |
| C11 | Dates are written "5 October 2026" or ISO 8601; there is no ordinal, season or relative date. |
| C12 | Every changing quantity carries "as of" and a date. |
| C13 | Each of "measured", "derived", "modelled", "drawn" is used only in its defined sense. |
| C14 | No hedge ("may", "could", "is thought to", "arguably") appears without a number or a citation in the same sentence. |
| C15 | No litotes and no downtoner ("not small", "fairly", "quite", "rather", "a bit", "somewhat"). |
| C16 | The page has at most one dry line; it is absent from the first screen, headings, forms, errors, tables and attribution; and it is true when read literally. |
| C17 | No idiom, sports or holiday reference, and no phrasal verb other than "pull back", "fly to", "set up", "zoom in" and "zoom out". |
| C18 | Every link's text names its destination; none says "here", "learn more" or "read more". |
| C19 | The maker is referred to in one grammatical person on the page. |
| C20 | No sentence could run unchanged on SpaceEngine's, OpenSpace's or NASA Eyes' site (08 checklist item 4, applied to headings and first sentences only). |

## 6. Fifteen changes, most valuable first

| # | Change | Evidence | Cost |
|---|---|---|---|
| 1 | Design the phone hero as a first-class version (inline portrait film with timed HTML captions and pause; poster under data saver and reduced motion), in place of the poster-and-list fallback. | Owner: "must look great on phones". 06 patterns 1 and 2 are absent below 760 px. NN/g's objection is to altered scrolling, not to motion (07). | High: one more encode in the hero media tool, a caption timeline, a pause control, a device test pass. |
| 2 | Rename `/educators/` to `/classroom/` and `/venues/` to `/domes/`, and make the nav labels parallel, before anything is indexed. | Berners-Lee: URLs should never change. Spec's own tasks-not-audiences call. NN/g on audience labels (07). | Low now (`nav.ts`, 11's map, spec text, llms plan); high after the root swap. |
| 3 | Type floors: Jost 400 for anything under 20 px and for docs body; Cormorant never under 20 px; small controls keep the ring with a Jost label. | Refactoring UI on sub-400 weights [S]; Cormorant is a display family [V]; NN/g on dark mode and small type (07). | Low: tokens and three components. Needs the owner's nod because it bends two directives. |
| 4 | Add `/about/` with name, face, purpose, the route to the form, press images and a colophon; add `/privacy/`. | 06 section C (who is behind it); funders have no page; a form collects personal data. | Medium: two short pages, one photograph, owner copy. |
| 5 | Fix the docs sidebar at seven groups with Start (one tutorial), Glossary and a developers subgroup, before slice `03-docs-guide` builds the layout. | Diátaxis (four needs, lists of about seven) [V][S]; neighbours Astro, Tailwind, OpenSpace [V]; 09 open question 14. | Low if done before the layout exists; it is a data file. |
| 6 | Print the deep link under every figure as "Open this view", and the third-party credit beside any image that contains one. | ESO's caption and credit pattern [V]; Rams on honesty; the manifest already stores the link. | Low: one `Figure` component. |
| 7 | One moving thing per viewport: each loop plays only when it is the most visible, each has the shared pause control, none fades in on scroll. | WCAG 2.2.2; Vercel, Kowalski, Stripe on motion [V]; Tuch et al. (07). | Low to medium: one IntersectionObserver script reused three times. |
| 8 | Add Pagefind search in the docs slices. | NN/g: search is the recovery route [V]; Pagefind is static and near 100 kB [V]; several hundred object names. | Low to medium: a post-build step, one input in the Docs header, a styled results list. Adds a dependency. |
| 9 | Replace the read-off-the-prototype spacing and size values with one spacing scale and seven type sizes. | Rams principle 8; Müller-Brockmann [S]; at least eleven sizes in use today. | Medium: a token pass across eleven components; visual diff needed. |
| 10 | Append the house-style addendum (3.3) and the literal-truth test (3.2) to 08, and give the copy reviewer rubric C1 to C20. | GOV.UK, Microsoft and Google guidance [V]; second-language irony research [S]; van der Bles on uncertainty [S]. | Low: text only. |
| 11 | Rebuild the footer as a four-column site map in text links, with version, release date and licence. | NN/g footers [V]; 06 pattern 8 (liveness); ring noise at footer density [J]. | Low. |
| 12 | Resolve the pronoun. At minimum, repair the footer, which names one maker and says "we" in the next sentence; better, reopen the "we" ruling. | 08: four of five solo makers use "I", and "we" from one person is "a small untruth" an institutional buyer notices. | Zero for the footer line; a copy pass if the ruling changes. |
| 13 | Break the mirrored image-and-text rows for the classroom and dome sections; let the address and the disc set each layout. | Vignelli's appropriateness [S]; the pattern is the commonest landing skeleton [J]. | Medium: two components redesigned and re-reviewed. Weakest evidence in this list. |
| 14 | Add the 404 page to the plan and a URL-stability test (a committed list of published paths that must resolve or redirect). | Berners-Lee [V]; NN/g 404 guidance [V]; 11 sections 3.3 and 3.4. | Low: one page, one test, one list. |
| 15 | Number craft: tabular numerals, non-breaking number-unit pairs, "billion" glossed once, and the comoving-distance note on the "46 billion light-years" card; drop the Places stagger. | Vercel guidelines [V]; false friends (EU hints [S]); Tufte's small multiples [S]; the science reviewer will raise the distance definition. | Low: CSS, one helper, two facts rows. |

## 7. Where the evidence contradicts an owner directive

Stated plainly, with what I would do about each.

1. **Jost 300 as the body face.** The one named source on the point says no weight under 400 for small interface text. 300 is defensible at 20 px and up and not below. (Change 3.)
2. **Dark theme only, for the docs.** Sustained reading is measurably easier dark-on-light for normal vision, more so as type shrinks (07, Budiu's summary of Piepenbrock). The directive stands for brand and subject; the docs pay for it with heavier, larger type and a strict measure. The evidence does not support the docs as they would be if set like Home.
3. **The display face on every control.** Cormorant is a display family; at the 17 to 18 px the nav and spine use, it is the least legible text on the page. "One coherent control" survives if the ring is the constant and the label face follows size.
4. **Dry humour for a European, second-language audience.** The two halves of that directive pull against each other. Google's guide says "Avoid humor"; NN/g calls it "extremely risky"; irony is slower and less accurate in a second language. Only the literal-truth kind of dryness is safe.
5. **"We".** One maker is named on the same line. 08's evidence favours "I".
6. **"Visually rich… stunning".** Low complexity wins first impressions (07) and Vignelli calls impact vulgar. Richness is supportable in the renders and nowhere else.
7. **A serif word over a full-bleed hero** is on 06's list of current templated tells. The Home hero is that pattern. It is kept honest by real footage and a wordmark; it would not survive a stock still or a slogan.
