# 08 — Copy: what makes it good, and a guide for skymap

Subagent web research, 2026-10-05. Unverified — open the cited source before relying on a claim.

Evidence key: **[R]** research with users or visitors · **[P]** practitioner opinion or house guide · **[2nd]** I read a summary or search snippet, not the primary · **[site]** page text fetched today through a summarising fetch model, so wording may be slightly off; check the live page before quoting it anywhere public.

Not obtained, so not used: GOV.UK content design (redirect loop), Shopify Polaris (socket error), Harry Dry's own page (HTTP 500; his three tests are cited from write-ups), Strunk & White, Serrell's book itself, Bitgood's primary papers, neal.fun's Deep Sea captions (403), the 100,000 Stars about text (the fetch returned only the loading screen and a Wikipedia excerpt), The Atlantic (blocked), BBC subtitle guidelines (blocked), Stamen's hire page (404), Kottke's about page (redirect not followed).

## Diagnosis

The draft is accurate and inoffensive, and that is the problem: almost every line could sit on any space site, and the lines that could not are buried. It also breaks the project's own rules in `docs/tour/writing-style.md` four times.

**Hero line: "From Earth's surface to the edge of the observable universe"**
- It is the README tagline with the verb removed. The README says "Fly from…"; the draft deleted the only word with a person in it.
- "From the smallest X to the largest Y" is banned by name in `writing-style.md` ("The tour *is* that; don't say it"). The video above the line is already showing it, so the line spends its ten words repeating the picture.
- A competitor can say it. SpaceEngine's homepage says you can travel "from star to star, from galaxy to galaxy, landing on any planet" [site]. The line fails Harry Dry's third test, "Can nobody else say this?" [P, 2nd].
- It leaves out the three things only skymap can claim: the positions are measured, the scale is true, and the visitor steers.

**Control: "Launch skymap"**
- The least broken line. Verb plus name, and it says what happens. Its weakness is that it does not continue anything the hero line started (Shapiro: the CTA should be "the actionable next step to fulfilling the claim in your header" [P]). It is acceptable as it stands.

**Note: "Free, open source. Needs a browser with WebGPU."**
- "Needs" opens with a hurdle, and names it in a word most visitors do not know. A teacher cannot tell from this whether the school laptops qualify.
- The page can detect WebGPU. A warning shown to everyone, including the majority for whom it works, is a claim nobody asked about. Show it only on failure.
- "Free, open source" is fine but is the weaker half of the zero-friction claim. "No account, nothing to install" is already in the draft, three sections down, where fewer people will read it.

**Journey captions**
- These are the best lines in the draft. "The light arriving now left during the last ice age" and "Its light is older than our species" do what the scale research asks for: one human comparison per number (07, section 2).
- The format is the fault. Six captions use one template: name, em dash, number, full stop, fact. By the third the reader has learned the rhythm and stops reading. Serrell's advice, as relayed by the Australian Museum, is to "vary the length of the sentences" [2nd].
- The em dash is a banned tell (`writing-style.md`), six times in a row.
- "1.3 light-seconds" uses the unit before teaching it. The first caption has one job, which is to make "light-" units mean something. Say that light takes 1.3 seconds to get here, and the unit is earned for the rest of the strip.
- Two rulers appear without being introduced: Apollo for the Moon, then Voyager twice. Pick the rulers in the first caption (a crewed ship and light) and hold them.
- Length. The Milky Way caption is about 100 characters. At the Netflix ceiling of 20 characters per second for adult subtitles [P], that is five seconds of reading with no time left to look. If captions are on screen for 2 to 4 seconds, four of the six are too long.
- "Past the planets there is almost nothing for four light-years" is the one caption that is an idea and not a statistic. It is also the one an astronomer will challenge (the Kuiper belt and Oort cloud are there). Keep the idea, check the wording.

**End caption: "That was a drawing. Skymap is the real thing: every point a catalogued star or galaxy, at its measured place."**
- It apologises for the thing the visitor has just enjoyed.
- "The real thing" is a self-awarded claim, and it contradicts the page's own honesty block. The README says the Milky Way disk is procedural. A site with a section called "What is measured, what is drawn" cannot also say "the real thing" forty lines earlier.
- The second half is good and specific. Keep that half.

**Lead heading: "One scene. True scale. Real surveys."**
- A three-beat fragment row. `writing-style.md` bans both the rule-of-three triad and "faux-profound fragments… Write a sentence." This is the most machine-sounding line on the page.

**Lead paragraph**
- "what astronomers have actually mapped": "actually" is a tic that implies someone claimed otherwise.
- "Nothing is resized to fit and nothing is cut between scales" defines the product by two absences. The reader has not seen the cheats being denied, so the denial means nothing. Scale research says diagrams compress the Earth to Moon gap by a median factor of 23 (07, section 2); say what the visitor will see instead.
- "without the picture ever changing hands" is a metaphor nobody uses and nobody can picture. Orwell's fourth question applies: "Is this image fresh enough to have an effect?" It is fresh, and has no effect.
- "leave a street in Copenhagen and arrive at the cosmic web" is the best clause in the draft. It is concrete, local, checkable, and no other site can say it. It is in the middle of the last sentence.

**"Look around"**
- The heading does not name a task that differs from the launch control.
- "anything with a name" is vague about the one feature it describes. Name three things.
- "Each opens the app already looking at it" explains how a link works.

**"Use it in a classroom"**
- The strongest section. "Every view is a link" is short, true and visual.
- "Choose where to look and when" hides a feature inside a pun. "When" means the simulated date, and a reader will take it as "whenever you like".
- No example. One concrete view a teacher might set up would do more than the three sentences around it.

**"Put it on a dome"**
- Three bullet fragments are a feature list. Research 06 found that no strong exemplar leads with feature rows.
- "rendered frame by frame" describes the maker's process. A dome operator wants resolution, format and frame rate.
- "A build made for one exhibit, wall or kiosk" does not say what a build is or who has had one.
- The proof line is the most valuable sentence in the section and it is last, passive, with no agent and no detail. A director buys risk reduction (06, section C). Lead with where it ran.

**Across the whole draft**
- Nobody is speaking. There is one named maker and no "I" anywhere. The copy reads as if a committee approved it.
- Every section body explains a mechanism. None shows a single instance.
- All lines run at one temperature. The V&A guide asks for "personality, life and rhythm", and says enthusiasm shows "in your choice of words… not in clichéd value judgements" [P].

## Principles

Ordered by how much each would change this site's copy.

1. **Say what only this site can say.** Test each line: can I picture it, can it be checked, could a competitor run it unchanged. Harry Dry, via https://www.storyrules.com/lessons-from-copywriting-with-harry-dry/ [P, 2nd].
2. **Concrete nouns beat abstractions.** "A street in Copenhagen" over "Earth's surface". Dry's memory demonstration (people keep "pitbull", lose "seamless transition"), same source [P, 2nd]; Orwell asks "What image or idiom will make it clearer?" https://www.orwellfoundation.com/the-orwell-foundation/orwell/essays-and-other-works/politics-and-the-english-language/ [P].
3. **Objective wording measurably outperforms promotional wording.** Nielsen and Morkes measured usability 27% higher for objective text, 58% for concise, 47% for scannable, 124% for all three; promotional claims make readers stop and doubt. https://www.nngroup.com/articles/concise-scannable-and-objective-how-to-write-for-the-web/ [R, 1997, small study, one site]. This is the research behind "astronomers smell hype".
4. **Show enthusiasm through precise words, never through value words.** "Words like 'delightful' or 'stunning' add nothing… They also assume that visitors will share the writer's view." V&A, *Writing Gallery Text*, p.16, https://www.vam.ac.uk/blog/wp-content/uploads/VA_Gallery-Text-Writing-Guidelines_online_Web.pdf [P].
5. **People scan.** 79% of test users scanned a new page; 16% read word by word. https://www.nngroup.com/articles/how-users-read-on-the-web/ [R, 1997]. Each heading and first sentence must work alone.
6. **The header says what the thing is; the control is the next step in that sentence.** "If the visitor reads only this text on your page, will they know exactly what you sell?" Julian Shapiro, https://www.julian.com/guide/startup/landing-pages [P].
7. **Short text is read by more people.** One 150-word label was read by 11% of visitors; the same text as three 50-word labels by 28%. Bitgood and Patterson 1993, via https://www.tandfonline.com/doi/full/10.1080/10645578.2021.2018251 [R, 2nd]. The V&A caps object labels at 50 to 60 words and calls short text "non-negotiable" (p.21) [P].
8. **First sentence under 16 words; one idea per sentence, one subject per paragraph.** V&A pp.13, 22, 23 [P]. NN/g gives 15 to 20 words per sentence for expert readers. https://www.nngroup.com/articles/plain-language-experts/ [R, qualitative].
9. **Experts want plain language too.** "No one has ever complained that a text was too easy to understand." Same NN/g article [R, qualitative]. A planetarium director is not insulted by short words.
10. **Write as you would say it to a friend, then read it aloud.** V&A point two, p.17: "If you stumble over words or get bored, you will know what visitors will experience" [P]. Mailchimp: "value clarity above all". https://styleguide.mailchimp.com/voice-and-tone/ [P].
11. **Bring in a person.** "People connect with people." V&A point seven, p.34 [P, citing Getty visitor research I did not read]. For this site the people are the maker, the survey teams, and the crews of Apollo and Voyager.
12. **Admit what is not known or not measured.** "There is no harm in showing the boundaries of our knowledge." V&A point nine, p.42 [P]. This is the honesty block's licence, and it should use plain statements such as "Its history is a puzzle" does.
13. **One voice, several tones.** "You have the same voice all the time, but your tone changes." Mailchimp, same URL [P]. The V&A chart (p.5) moves from "more personal, e.g. first, second person" for visitors to "more formal, e.g. third person" for institutional stakeholders. Hero, classroom and commission page can differ in tone and still be one person.
14. **An error says what happened and what to do, and never blames.** Avoid "invalid, illegal, or incorrect". https://www.nngroup.com/articles/error-message-guidelines/ [R-based guidance]; Yifrah's two-step formula (what went wrong, then how to fix it) [P, 2nd].
15. **Be useful in conversation terms: enough, true, relevant, clear.** Grice's maxims as used by Erika Hall, and Podmajersky's "purposeful, concise, conversational, clear" [P, 2nd for both; I read summaries only]. A line that answers a question nobody asked fails "relevant".

## Techniques for wonder without hype

Each technique with a micro-quote. Sagan, Munroe and Panic lines are from fetched pages; Macfarlane, Mack, Carson and Yong are from search snippets of quote collections [2nd], so check before reuse.

- **The scale is stated as a procedure, in a flat voice.** "Now every ten seconds, we will look from ten times further away" (Philip Morrison, *Powers of Ten*, 1977, as quoted at https://accumbensjuice.wordpress.com/2013/04/16/powers-of-ten/ [2nd]). No adjective. The rule does the work.
- **Start somewhere small and ordinary.** The same narration opens on "the start of a lazy afternoon, early one october". The picnic is what makes the galaxy large.
- **Demonstratives that point.** "Look again at that dot. That's here. That's home. That's us." (Carl Sagan, *Pale Blue Dot*, via https://www.planetary.org/worlds/pale-blue-dot). Eleven words, nine of them monosyllables. It is a three-beat line, which this site bans; it works because each beat is closer and warmer than the last, not three parallel adjectives. Borrow the pointing and the short words, not the triad.
- **The turn at the end of the sentence.** "It's a lovely morning in the village, and you are a horrible goose." (Panic, Untitled Goose Game, https://panic.com/ [site]). The V&A's Lartigue label does the same: one of the women was his wife, "but he was not sure which" (p.35). Put the surprising noun last.
- **The specific last noun.** A platypus spur "can cause agonising pain in humans and kill a dog" (David Attenborough, quoted in the V&A guide, p.15). "A dog" is why you remember it.
- **Gloss the term in the same breath.** Same passage: "monotreme, meaning that it is a mammal that lays eggs". This is already the tour rule ("no jargon without a gloss").
- **Deadpan precision.** Munroe ends a relativistic catastrophe with the batter "would be eligible to advance to first base" (https://what-if.xkcd.com/1/). The humour comes from keeping the register level while the content escalates. That is the only kind of humour that fits this site.
- **Relative speed made visible.** "they're just hanging there, frozen" (Munroe, same page). A number (600 million miles per hour) is followed at once by what it looks like.
- **Common words only.** Munroe's ten-hundred-word rocket label: "you will not go to space today" (*Thing Explainer*, via https://www.goodreads.com/book/show/25329850-thing-explainer [2nd]).
- **Two very short sentences, subject and verb.** "Ice breathes. Rock has tides." (Robert Macfarlane, *Underland* [2nd]). Use once per page at most; a row of them becomes the banned fragment style.
- **Admit the limit of the reader's mind, plainly.** "There is simply no easy way to hold infinite space in a finite brain." (Katie Mack, *The End of Everything*, via https://www.goodreads.com/work/quotes/59898322 [2nd]). Honest about difficulty, no "humbling".
- **A real person's words.** Henry VII's inscription to his daughter, quoted in a 63-word label: "Pray for your loving father that gave you this book" (V&A, p.34). For skymap: a line from a survey paper, a mission log, or the maker.
- **Build the scene out of things, one at a time.** Ed Yong opens *An Immense World* with "Imagine an elephant in a room", then adds a mouse, a robin, an owl [2nd, https://www.goodreads.com/en/book/show/59575939]. The tour style bans "imagine"; keep the method (one known room, objects added in order), drop the verb.
- **Plain words for feeling, said once.** "A child's world is fresh and new and beautiful" (Rachel Carson, *The Sense of Wonder* [2nd]). Three one-syllable adjectives joined by "and". It reads as speech, not as a list.
- **Withheld adjective.** In every example above the wonder word is missing. The V&A states it as a rule: "A well-chosen noun or verb does not need qualification" (p.16).
- **Present tense, light as the clock.** Already in the draft and correct: "The light arriving now left during the last ice age." Time is a better ruler than distance because everyone has a feel for years (07: accuracy collapses away from human scale).

## Exemplar copy, annotated

All quoted lines [site], fetched 2026-10-05.

**Panic** (https://panic.com/)
- "A new, tiny, yellow console with a crank. And a bunch of brand-new games." Four physical facts you can picture, then the benefit as an afterthought. No claim about fun.
- "Need to transfer files?" The one rhetorical question, and it is the reader's actual task. Skymap bans rhetorical questions; note only that the task is named in the reader's words.

**neal.fun** (https://neal.fun/)
- "Hi! I'm Neal. This is where I make stuff on the web." Who, what, where, in twelve words. One person, so "I".
- The project titles are the whole pitch: "Draw a Perfect Circle", "Spend Bill Gates' Money", "The Deep Sea". Webiano's reading: "Each project has a clean promise that can be understood in one glance" (https://webiano.digital/neal-fun-is-the-web-that-still-rewards-curiosity/) [P].

**Bruno Simon** (https://bruno-simon.com/)
- "My name is Bruno Simon, and I'm a creative developer (mostly for the web)." Then: "And don't break anything!" A solo maker's site in first person, with one dry aside. The aside is the personality; there is only one.

**Bartosz Ciechanowski, Moon** (https://ciechanow.ski/moon/)
- "You can drag it around to change your point of view, and you can also use the slider to control the date and time". The instruction is in the sentence that introduces the picture, in plain verbs. This is the model for skymap's deep-link and classroom lines.
- His opening ("In the vastness of empty space surrounding Earth…") is the weakest sentence on the page, and it is the only one with a grandiosity noun. The explainers are loved for the demos and the plain instructions, not the first line.

**Obsidian** (https://obsidian.md/)
- "Your thoughts are yours." / "Obsidian stores notes privately on your device, so you can access them quickly, even offline." A short claim as heading, then the mechanism that makes it true. Heading and proof, every section.
- "Sharpen your thinking." is the hero. It is abstract and works only because the product is famous. Do not copy the hero; copy the section pattern.

**iA Writer** (https://ia.net/writer)
- "Keep your hands on the keys and your mind in the text." Body parts and objects. A benefit you can feel in your hands.
- "iA Writer tracks and shows what you typed and what you pasted." A feature stated as two verbs and a plain contrast.
- "The Benchmark of Markdown Writing Apps" is a self-awarded superlative. It reads worse than everything under it.

**Things** (https://culturedcode.com/things/)
- "Within the hour, you'll have everything off your mind and neatly organized". A time and an outcome. Checkable.
- "award-winning", "Simply Powerful": the lines nobody remembers. Useful as a control sample.

**Universe Sandbox** (https://universesandbox.com/)
- "Collide Planets & Stars", "Supernova a Star", "Model Earth's Climate". The feature list is written as things you do. "Supernova" used as a verb is the one playful word.

**SpaceEngine** (https://spaceengine.org/)
- "Universe simulator". Two words, a category, no adjective.
- "You can travel from star to star, from galaxy to galaxy, landing on any planet, moon, or asteroid". This is the sentence skymap's hero line currently resembles. SpaceEngine's universe is largely generated; skymap's difference is "measured", and the draft hero does not say it.

**NASA Eyes** (https://science.nasa.gov/eyes/)
- "Land a Rover", "Grand Finale", "Phone Home". Deep-link labels of two or three words, each an event, not a place name. The model for "Look around".
- "See which missions are communicating with Earth right now". Liveness in two words at the end.
- "in a fun and interactive way" is filler; the labels above it never needed it.

**OpenSpace** (https://www.openspaceproject.com/)
- "From a portable screen to a 30-meter planetarium, OpenSpace adapts to your display." A from/to that earns its place because both ends are objects with sizes.
- "Free. Open source. Cross-platform." A fragment triad. It is the convention in this field and it still reads as boilerplate.

**WorldWide Telescope** (https://worldwidetelescope.org/home/)
- "WorldWide Telescope is a tool for showcasing astronomical data and knowledge." Passes Shapiro's test (you know what it is) and fails Dry's (you cannot picture it).
- "It's not a physical telescope" answers a real confusion caused by the name. Skymap has an equivalent: it is not a star chart of the sky from your garden. Worth one plain sentence somewhere.

**Linear** (https://linear.app/)
- Section heads are noun phrases naming a stage of work: "Intake and integrations", "Build, review, and ship". Skymap's task-named imperatives ("Use it in a classroom") are better for a first-time visitor and should stay.

**Teenage Engineering** (https://teenage.engineering/)
- Product names and "buy now", nothing else. Confirms 06: this works only when the object is already known.

### Hire and commission pages by independent makers

What the copy says, in page order [site]:

| Maker | Opening | Proof | Scope | Next step |
|---|---|---|---|---|
| Jan Willem Tulp, https://tulpinteractive.com/about/ | "Hi, I'm Jan Willem, I create Data Visualizations" | Named clients in a plain list: European Space Agency, Scientific American, Nature | Not stated on this page | Email, phone number and street address in plain text |
| Nadieh Bremer, https://www.visualcinnamon.com/about/ and /contact/ | "Bringing Your Data to Life" | Awards and exhibitions, lower down | Five named services; three named engagement shapes ("The Full Process", "The Design", "The Advice"); and a refusal: "I generally don't take on the creation of dashboards" | Email and form; "I'll get back to you within 1-2 business days." |
| Stefanie Posavec, https://www.stefanieposavec.com/about | "I'm Stefanie, and I help people use data to communicate, educate, and bring communities together." | In the work | "From art installations to agency collaborations" | "Interested in collaborating?" then "Get in touch" |
| Moritz Stefaner, https://truth-and-beauty.net/about | "Moritz Stefaner helps organizations find truth and beauty in relevant and meaningful data." | "His clients include the OECD, the WHO…"; "45+ named clients" | "independent designer, consultant and researcher" | None on the page fetched |
| NSC Creative, https://nsccreative.com/ | "THE IMMERSIVE STORYTELLING STUDIO" over a reel | The reel | None in text | Email and phone |

Findings [my judgement from the five pages]:
- **Order is consistent:** who I am and what I make, in one sentence; then where the work has been; then what I take on; then one way to reach me.
- **Proof is a named place, not an adjective.** Nobody says "trusted by". They list names.
- **Scope is stated by naming shapes of job and by one refusal.** Bremer's "I generally don't take on…" is the most trust-building line in the set. It tells a buyer she will say no.
- **None of the five states a price.** Price is signalled indirectly: named engagement shapes, the size of past clients, and a stated response time. For skymap, 07 section 5 has the planetarium buyer's expectations (formats, dome systems, a screener).
- **First person singular in four of five.** Stefaner's third person reads as a press biography. The studio voice ("THE IMMERSIVE STORYTELLING STUDIO") is the agency sound to avoid.
- **A response time is the cheapest reassurance on any of these pages.** One of five has it.

### Short captions: what the evidence supports

- Most visitors do not read most labels; shorter chunks are read by more people (principle 7) [R, 2nd].
- Serrell's word ranges, as relayed by a UCSB library guide: titles 1 to 7 words, captions from 20 words up. https://guides.library.ucsb.edu/c.php?g=547094&p=3752259 [P, 2nd; editions differ]. The Australian Museum's review gives "a maximum of 50 words" per label (attributed there to Punt 1989) and "people only usually spend a few seconds reading a label" (McLean 1993). https://australian.museum/learn/teachers/learning/writing-text-and-labels/ [2nd].
- Those are budgets for a visitor standing still. A caption over moving footage is closer to a subtitle. Netflix's English style guide: up to 20 characters per second for adult programmes, 42 characters per line, two lines at most; minimum duration 20 frames. https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-Timed-Text-Style-Guide [P, industry standard]. So a 3-second caption has a ceiling of 60 characters, and that ceiling assumes the viewer is also hearing the words. With no audio and a picture worth looking at, aim lower [my judgement: about 45 characters per 3 seconds].
- The tour's own rule already says it: "Too long → cut words or raise dwell, never rush the reader."
- If the captions are scroll-paced and not timed, the reader sets the dwell and the museum budget (up to about 25 words) applies. The owner needs to say which (open question 4).

## Skymap copy guide

### Voice

One person who built this is showing it to you and telling you exactly what it is. The sentences are short, the nouns are things you can point at, and every number comes with one comparison. Where something is drawn and not measured, the copy says so first.

### Who is speaking

- **Hero and journey captions: no pronoun for the maker.** Awe directs attention to the stimulus and away from the self (Shiota et al., in 07), and the first screen should be about the sky.
- **"We" and "our" only for people in general**, as the tour style already allows: "our galaxy", "our species".
- **Below the journey strip, and on both sub-pages: "I".** There is one named maker. "We" from a solo maker is a small untruth, and an institutional buyer who finds one person behind a "we" trusts the rest less. Four of five independent makers above use "I"; the two best solo sites (neal.fun, Bruno Simon) open with it.
- **Never third person about the maker** on the site itself ("Alexander Rulkens is a…"). Keep that for a downloadable capability sheet, which is where the V&A chart puts the formal register.
- **"You" is allowed for what the visitor can do** ("you hold the camera"). It stays banned as a command to look ("notice…").

### Vocabulary

Use: fly, pull back, measured, catalogued, survey, drawn, true scale, one scene, link, address, dome, fisheye, film, build, and the proper names (Gaia, SDSS, 2MRS, GLADE, Voyager 2, Apollo).

Ban, beyond the list in `writing-style.md`: seamless, powerful, stunning, immersive, unlock, journey, explore, discover, experience (as a noun), platform, solution, next-generation, cutting-edge, the real thing, actually, simply, just, bespoke, tailored, "from X to Y" unless both ends are objects with a size, "not X but Y", "whether you're a… or a…", any row of three fragments, any em dash, any exclamation mark, any rhetorical question.

Prefer "app" to "tool" on the homepage and "tool" on the educator and commission pages. Prefer "free" to "free to use". Write "open source" once, in the footer or the note, not in every section.

### Rules per element

| Element | Rule | Budget |
|---|---|---|
| Wordmark line | Says what the video cannot: measured, true scale, you steer. One checkable claim. No "from/to". | 10 words or fewer |
| Launch control | Verb first. Continues the hero line. Same label everywhere on the site. | 2 to 3 words |
| Hero note | Removes a reason not to click. Never names a technology the visitor has to look up. | 8 words or fewer |
| Journey caption | A title that is a name. Then one sentence with one number or one comparison, never two numbers. No dash. Teach "light-" units in the first caption. Vary the sentence shape from one caption to the next. | Title 4 words; body 45 characters if timed at 3 s, 25 words if scroll-paced |
| Section heading | An imperative naming what the visitor will do. Sentence case. No audience labels. | 5 words or fewer |
| Body paragraph | First sentence carries the section alone and is under 16 words. One example of a real instance. Stop when the point is made. | 45 words; 3 sentences |
| Deep-link label | Names a moment or a sight, not a feature: an object, plus what is happening to it. | 5 words or fewer |
| Proof line | Place, date, what ran, on what. Active, with "I". No adjective. Goes first in its section. | 20 words or fewer |
| Honesty block | Two plain lists, "measured" and "drawn", each item with its source or its reason. Say "drawn" without apology. | 12 words per item |
| Form labels | The question as a person would ask it: "Your name", "Where you work", "Email", "What do you have in mind". No phone field. A stated reply time under the button. | 5 words or fewer |
| Form errors | What is missing, then what to do. No "invalid", "error", "oops". Example: "There is no email address yet. Add one so I can reply." | 15 words or fewer |
| WebGPU-unsupported message | Shown only when detection fails. Says what happened in plain words, what does work, and what to do. Offers the film as the fallback. | 30 words or fewer |

### Checklist for any new line

1. Read it aloud. Would you say it to a friend standing next to the screen?
2. Can you picture it?
3. Could it be checked, and would it survive the check?
4. Could SpaceEngine, OpenSpace or NASA Eyes run it unchanged? If yes, rewrite.
5. Is the strongest noun at the end of the sentence?
6. One number at most, and does it have its comparison?
7. Any word from the ban list, any dash, any triad?
8. Does it answer something the reader was already wondering?
9. Is it within budget?
10. Does it contradict the honesty block?

## Rewrites

Registers: **A** plainest, **B** most concrete, **C** most personal. **→** marks the recommendation. Facts come from the draft unless flagged. "[verify: README]" means the repo README states it and the owner should confirm it is still true; "[verify]" means I am not sure it is true at all.

**Hero line**
- A. Fly from the ground to the edge of the observable universe.
- → B. The measured universe at true scale. You hold the camera.
- C. I wanted to fly through the galaxy surveys, so I built this. [verify: from the Show HN origin story]

B says the three things the video cannot. C belongs at the top of "Work with me", not on the hero.

**Launch control**
- A. Open skymap
- B. Start on Earth [verify: only if the app opens on Earth]
- → C. Fly it yourself

"Launch skymap" from the draft is also acceptable. C is better only because it follows "You hold the camera".

**Hero note**
- A. Free and open source. Runs in current Chrome, Edge, Firefox and Safari. [verify: README lists Chrome 113+, Edge 113+, Firefox 141+, Safari 26+]
- → B. Free. No account, nothing to install.
- C. Free, open source, and made by one person.

Detect WebGPU and show the unsupported message only on failure. Draft for that message: "This browser cannot run skymap yet. Current Chrome, Edge, Firefox and Safari can [verify: README]. The film above shows the same flight."

**Caption: the Moon**
- A. The Moon. Light gets here in 1.3 seconds.
- → B. The Moon. Three days by Apollo. 1.3 seconds by light.
- C. The Moon. The farthest any person has stood. [verify]

B introduces both rulers. It is two short sentences; allow that once, here.

**Caption: Neptune**
- A. Neptune. Sunlight takes four hours to arrive.
- B. Neptune. Voyager 2 took twelve years. Light takes four hours.
- → C. Neptune. One spacecraft has been here, once. It took twelve years. [verify: "one, once"; Voyager 2, 1989]

**Caption: the gap**
- A. The gap. Past the planets, almost nothing for four light-years. [verify "almost nothing" with an astronomer: Kuiper belt, Oort cloud]
- → B. The gap. Until now the distances were light-hours. The next is in years.
- C. The gap. Most pictures of the solar system leave this part out.

**Caption: the nearest star**
- A. The nearest star. 4.2 light-years.
- → B. The nearest star. Voyager would need about 75,000 years.
- C. The nearest star. Its light is four years old when it reaches us.

**Caption: the centre of the Milky Way**
- A. The centre of the Milky Way. 26,000 light-years.
- → B. The centre of our galaxy. This light left during the last ice age.
- C. The centre of our galaxy. When this light set out, people were painting caves. [verify the date against 26,000 years]

**Caption: Andromeda**
- A. Andromeda. 2.5 million light-years.
- → B. Andromeda. This light is older than our species.
- C. Andromeda. The farthest thing you can see with your own eyes. [verify]

**End caption**
- A. That was a sketch. In the app, the catalogues place the points. [verify: the strip is a drawing, as the draft says]
- → B. In skymap, each of those points is a catalogued star or galaxy at its measured position.
- C. I drew this strip. Skymap draws from the catalogues. [verify: who drew it]

B is the good half of the draft line with the apology and "the real thing" removed. Put the launch control directly under it.

**Lead heading**
- A. What skymap is
- → B. A street in Copenhagen and the cosmic web, in the same scene
- C. Why I built it

**Lead paragraph**
- A. Skymap is a free app for flying through the parts of the universe that astronomers have mapped. It is one 3D scene at true scale. Stars and galaxies sit where the surveys measured them.
- → B. Start on a street in Copenhagen and pull back. The city shrinks into the Earth, the Earth into a dot beside the Sun, and the scene never cuts or rescales on the way out to the cosmic web. The stars are from Gaia. The galaxies are from SDSS, 2MRS and GLADE.
- C. I kept seeing slow pans across galaxy catalogues in research videos and wanted to fly through them myself. Skymap is that: one scene at true scale, built by one person from public survey data. [verify: from the Show HN origin story]

B is 51 words, six over budget; cut the last two sentences if the honesty block names the surveys.

**"Look around"** (suggested heading: "Pick somewhere to start")
- A. Search for a named star, planet or galaxy and fly to it. Or start with one of these. [verify what search covers; README names the famous atlas, 48,000 PGC aliases and named structures]
- B. Type a name, such as Saturn, Betelgeuse or M87, and the camera flies there. Or start with one of these. [verify each is searchable]
- → C. These are the places I show people first. [verify: owner picks them]

With C, the link labels do the describing. Pattern for labels, after NASA Eyes: object plus what is happening, for example "Saturn, rings edge on" or "Stars orbiting the black hole" [verify: both are illustrations of the pattern, not confirmed deep links; the README does list S-stars orbiting Sagittarius A*].

**"Use it in a classroom"**
- A. Every view has its own link. Set up a view, copy the address, and each pupil opens the same view on their own screen. No accounts, nothing to install.
- → B. Point the camera at Jupiter, set the date, and copy the address. The whole class opens the link and sees what you see. No accounts, nothing to install. [verify: date in the link; README describes `#t=` links]
- C. I made every view a link so a teacher can set one up the night before and hand it to a class. No accounts, nothing to install. [verify: intent]

**"Put it on a dome", offer lines**
- A. Fisheye output for planetarium domes. 4K films, rendered frame by frame. Builds made for a single exhibit, wall or kiosk.
- B. Skymap renders in fisheye for a dome and as 4K film. I also make builds for a single exhibit, video wall or kiosk.
- → C. I have shown skymap in a dome, and I can make a version for yours: fisheye output, a 4K film, or a build for a single exhibit or kiosk.

Put the proof line above these, not below.

**"Put it on a dome", proof line**
- A. Shown in the dome at ‹venue› in September 2026.
- → B. ‹Venue›, September 2026: ‹what ran›, on a ‹size› dome. [all three placeholders are the owner's to fill]
- C. In September 2026 I showed skymap in the dome at ‹venue›.

Use C until the details for B are confirmed and the venue has agreed to be named.

## Open questions for the owner

1. **First person.** Is "I" acceptable below the hero and on both sub-pages? Six recommended rewrites depend on it.
2. **The dome showing.** Venue name, permission to name it, dome size, what was shown (live or film), and whether anyone there can be quoted or named as a reference.
3. **What a custom build has consisted of so far.** Deliverables, formats, rough duration, and whether live dome operation has been done or only pre-rendered film. The commission page cannot state scope, or a refusal, without this.
4. **The journey strip.** Is it a drawing or a recording of the app, and are its captions timed or scroll-paced? The answer sets the caption budget (45 characters or 25 words) and decides the end caption.
5. **Where links land.** What view "Launch" opens, and the exact list of deep links for "Pick somewhere to start", in the owner's order.
6. **Price and availability.** Whether the commission page should signal size of job, availability or a reply time, given that none of the five maker pages studied states a price.
