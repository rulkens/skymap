# Grill Session: Docs review agents — 2026-10-08

Source: the owner's remark while hand-authoring the website's copy through the on-page feedback tool: "the whole docs feels like a giant slop cannon shot a huge amount of words at me. Let's do some brainstorming on defining review agents that can clean this up, from a user / copywriting perspective, make it actually useful to a user of the site."

The docs are 27 hand-written pages (about 25,000 words) plus about 60 generated data pages. The aim is a set of agents, a review UI and a learning loop that bring the docs down to what a reader needs, in the owner's voice, with the owner ruling in the page rather than in chat.

---

## Q1: Who is the reader?

**The question:** Every later decision (what gets cut, how short, what a reviewer flags) depends on who each page is judged for, and the docs currently try to serve everyone at once.

**Considerations:**

- **Option A (one reader, the app user):** stuck or curious, asks "how do I do X" or "what am I looking at"; anything about how skymap is built goes.
- **Option B (two readers, kept apart):** the app user for Start, Guide and Reference; a scientist, funder or developer checking claims for Science, Simplifications, Rendering, Data and Developers. Each gets its own test and budget.
- **Option C (one reader, the careful sceptic):** everything stays, tightened sentence by sentence.

**Decision:** B. The owner's notes point both ways ("just plainly communicate where to find it" is the user; the data and Science pages exist so a funder can verify things). Mixing the two is what buries a how-to in justification.

## Q2–Q3: Cut, rewrite, and when

**The question:** May the agents only delete, or also write, and does the writing wait for a voice model?

**Considerations:**

- **Cut only:** nearly every note the owner left was a deletion; a writing agent adds the voice the owner objects to; a diff of removed lines is cheap to judge.
- **Cut then rewrite:** volume first, voice second.
- **Both now vs rewriter after Home:** Home is the only text the owner wrote and it is not finished.

**Decision:** two agents, a cutter and a rewriter. The cutter runs now; the rewriter waits until the owner says Home is done and works only on what survived the cut (the owner: "the home page rewrite is not done yet").

## Q4: What the cutter judges against

**The question:** The unit of judgement. A per-sentence test keeps every true sentence; a half-length budget is a proxy that cuts the right amount for the wrong reasons.

**Considerations:**

- **Option A (the page's job):** the agent writes one line, the question a reader comes to the page with, and removes everything that does not answer it, whole sections included. Pages with the same job merge; pages with no job are deleted.
- **Option B (a per-sentence test),** with or without a word budget.
- **Option C (repeats and off-topic only).**

**Decision:** A. The owner's notes were about sections without a job ("tell me what the goal is of this section", "what does this even mean?"), not sentences that were too long. The job line also becomes the rewriter's brief.

## Q5: When the owner rules on the job lines

**Decision:** before the cut. The cutter writes every job line first (27 pages, one shared line for the generated data pages) and stops; the owner corrects or strikes them in one pass; merges and deletions are settled there. The owner: "ah now i get the job line. I think its really useful!"

## Q6: The review UX

**The question:** The owner asked for a diff in the page itself, "a useful UX for me to judge what needs to be deleted or rewritten".

**Considerations:**

- **Option A (track changes in the page):** cut passages struck in place, job line editable in a bar, live word count, click to change a mark's state, a key to read the clean result.
- **Option B (side by side):** doubles the reading, does not fit the docs' measure.
- **Option C (a toggle only):** hides what was taken, which is what the owner wants to judge.

**Decision:** A, built the same day as a dev-only review mode (`packages/website/src/dev/review/`, `tools/site/reviewPlugin.ts`, one JSON review file per page). Refined during the session by the owner's rulings:

- shortcuts shown in the bar ("I will forget the shortcuts, need to be reminded in a subtle way");
- a rewrite takes the replacement wording AND an instruction ("if i want a rewrite, i need to be able to say how it should be rewritten");
- an optional "why" on every action ("there is no text box right now where i can say why it has been cut?");
- a fourth state, good, with an optional why ("some way to say, 'yes this is good copy'");
- the review UI lives in a panel opened from an icon beside each reviewed section, not in the flow of the page;
- the feedback tool and the review mode are one overlay behind one key, two files on disk ("they should be folded together. this is confusing now").

## Q7: The test on the evidence pages

**Considerations:**

- **Option A (claims and sources):** the job line asks which claims a reader can verify and whether each source is beside it; narrative, restated user-page content and connecting prose go; Science and Simplifications become lists of claims with sources; the data pages keep record, licence and switch.
- **Option B (the user test for all):** strips the sources that are the point of these pages.
- **Option C (no cut, rewriter only):** leaves about 7,000 words a funder will not read.

**Decision:** A ("A i guess").

## Q8: How the owner's rulings reach the next cutter

**Considerations:**

- **Option A (a distilled rules file):** after each ruled page, a distiller updates one short document; the cutter's brief is Home plus this file; it compounds page by page.
- **Option B (raw rulings in every brief):** noisy, grows with every page.
- **Option C (nothing explicit).**

**Decision:** A, with the owner's condition "you need to be smart about the rule file". The design: three sections (Cut, Do not cut, Rewrite with before → after pairs and the owner's "how"); one rule per pattern with the owner's examples quoted verbatim (page + mark id) and a count, tentative at one example and binding at three; a new ruling that fits a rule adds to its count; contradictions go under Open for the owner, never resolved by the distiller; a cap of about 40 rules, merged or dropped with a note when full. The file is committed as `docs/superpowers/conventions/site-copy.md` so it survives the worktree.

## Q9: Does an untouched cut count as approved?

**Considerations:** a "Done with this page" button (one click turns reading into evidence); explicit flips only; all untouched cuts.

**Decision:** explicit marks only. The owner: "not really. i might go over it again later." Positive evidence comes from the good state instead. Untouched cuts are neither evidence nor applied on their own (see Q11).

## Q10: One tool

**Decision:** one overlay and one key (`f`); the section icons and panel list notes and marks together; on disk notes keep going to the feedback folder the note worker watches and marks to the review file the cutter reads. A single store (everything a note with a kind) was rejected because it rewires the worker and watcher mid-pass; two tools behind one cycling key keeps the confusion.

## Q11: When a cut reaches the files

**Decision:** on the owner's word per page or per section, as an Apply button in the bar and in each section panel: it states the consequence first ("removes 9 passages · 1632 → 1405 words · 2 rewrites with text · 1 left for the rewriter"), writes an apply request into the review file, an applier agent edits the `.mdx` and commits one commit per request, and the bar shows "applied · commit" with the applied marks greyed as history. Undo is a revert of that commit. Automatic application on any ruling and a single application at the end were rejected.

## Q12: Order of pages

**Decision:** pilot, then user pages, then evidence pages. "What is in the scene" first (its demo review file replaced by a real cut), the owner rules, the distiller writes the first rules; the Guide and Start pages in one round; rules; Reference; then the evidence pages under the Q7 test. Largest-first and all-at-once were rejected: the pilot calibrates the cutter, and the rules need rounds to work.

## Decided without asking

- The cutter runs on Opus (judgement), the applier and the UI work on Sonnet.
- The distiller runs before each cutter round, on the pages the owner has marked since the last round.
- The generated data pages are one job ("record, licence, switch"); their cuts land in `packages/website/src/data/dataSourceNotes.ts`.
- A UI/UX convention (`docs/superpowers/conventions/ui-ux.md`) is being researched and written in the same session, after the owner asked whether UI work consulted any design document ("or just slop cannon UI in?"); every UI brief cites it and reports its self-check.
