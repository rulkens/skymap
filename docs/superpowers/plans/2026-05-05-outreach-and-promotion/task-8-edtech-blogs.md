# Task 8: Ed-tech blogger / newsletter outreach

> **Added 2026-06-18.** Second channel borrowed from the AstroGrid study
> (see [task-7-product-hunt.md](task-7-product-hunt.md)). AstroGrid was
> picked up by **outilstice.com** (Fidel Navamuel — an independent
> French ed-tech blog, ~1,000 "digital tools for teaching" resources,
> running since 2008), framed as "a real online simulator to project in
> class — no install the night before". That pickup was almost certainly
> organic spillover from PH visibility. Skymap can do this **deliberately**,
> and its didactic angle is arguably a *stronger* fit than AstroGrid's.

## Why skymap fits this circuit

The "interactive tools for teachers" blog/newsletter ecosystem exists to
surface exactly this: free, browser-based, zero-install, visually
immediate science tools. Skymap's differentiator over AstroGrid here is
real and not hype:

- **Self-documenting / didactic codebase** — it's pitched as a learning
  project, which resonates with educators teaching *both* astronomy and
  programming.
- **Open-source + free + no signup** — the three filters these blogs
  apply before they'll cover a tool.
- **Real catalog data** — a teaching point in itself (this is what actual
  sky surveys look like, not an artist's render).

The honesty caveat from Task 7 applies harder here: ed-tech reviewers
test on **entry-level Chromebooks**, and AstroGrid's one critical note
was WebGL slowdowns on old hardware. Skymap is WebGPU — **narrower device
support than WebGL today.** Lead with "needs a WebGPU-capable browser"
up front rather than letting a reviewer discover it mid-test; set the
expectation honestly.

## Steps

- [ ] **Build a target list** (~8–12 outlets) — start with outilstice.com,
  then peers: ed-tech tool blogs, "cool websites for the classroom"
  newsletters, astronomy-education resource sites (e.g. astroEDU / IAU
  OAE adjacent), and a couple of general "interesting interactive web
  tool" newsletters. Record outlet, URL, editor name/contact, language.
- [ ] **Write one short pitch template** (~120–150 words) — what it is,
  the classroom use ("project the cosmic web / scale of the local
  universe"), the WebGPU requirement stated plainly, the live link, and
  that it's free + open-source. Voice matches the README.
- [ ] **Customize per outlet** before each send — reference something the
  outlet actually covered; no mail-merge blasts.
- [ ] **Stagger sends** over several days (same anti-flood discipline as
  Task 5).
- [ ] **Verify + log** — record each send and any reply in
  `outreach_log.md`; no `NNNNNNNN` / placeholder literals in sent mail.

## Sequencing note

Best sent *after* a Product Hunt launch (Task 7) so the pitch can
reference current visibility, but it does **not** strictly block on it —
the 80–100 visitors/day + live demo are enough of an opener on their own.
