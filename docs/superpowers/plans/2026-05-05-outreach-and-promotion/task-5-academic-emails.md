# Task 5: Targeted academic outreach (cold emails)

After Show HN lands (or doesn't — but ideally lands), send five customised cold emails. Each email has its own audience and angle. _Wait until Task 4 has at least one piece of traction to reference_ — even a Show HN with 30 points is a real warm-opener. If HN was a complete dud, lead with the live demo and Zenodo DOI instead.

**Files:** No source-tree files. Drafts below; copy-paste at send time.

### Step 5.1: Email 1 — SDSS outreach team

- [ ] **To:** `outreach@sdss.org` _(check the SDSS web team's current contact at https://www.sdss.org/people/ if this address bounces)_
- [ ] **Subject:** `Browser-based WebGPU 3D explorer for SDSS DR18 — feedback welcome`
- [ ] **Body:**

```
Dear SDSS Outreach team,

I'm writing as an independent developer with a small project that uses
SDSS DR18 data and that I hope might be useful to your education /
public-outreach work.  I've built skymap, a free browser-based 3D
explorer that loads SDSS, 2MRS, and GLADE galaxy catalogs and lets
users orbit the cosmic-web wedge in real time.  It runs on WebGPU
(Chrome/Edge 113+) with no install, no Python.

For SDSS galaxies, the on-zoom thumbnail is fetched from your DR18
ImgCutout endpoint (which exposes CORS headers — thank you for that).
Spectroscopic redshift and photometric magnitudes are pulled directly
from your SkyServer SQL output.  Citation and attribution are listed
prominently in the README.

Live: https://skymap.rulkens.com
Source + acknowledgements: https://github.com/rulkens/skymap
DOI: https://doi.org/10.5281/zenodo.NNNNNNNN

Two specific questions, if you have time:

1. Is there an SDSS Voyages page or classroom-resource list where a
   tool like this would fit naturally?  I'd value being suggested as
   a complement to the existing 2D sky viewers.
2. Any data-attribution language I should be using that I'm not?

Happy to incorporate feedback, and equally happy to hear "no thanks".

Best regards,
Alexander Rulkens
rulkens@gmail.com
```

- [ ] **Verify by checking your sent-mail folder** that the message went out without the placeholder DOI digits remaining.

### Step 5.2: Email 2 — GLADE authors

- [ ] **To:** Gergely Dálya (corresponding author on GLADE / GLADE+; lookup at https://orcid.org or via the most recent GLADE+ paper). Likely current affiliation is University of Ghent or Wigner Research Centre for Physics.
- [ ] **Subject:** `Skymap: a 3D GLADE explorer in the browser, GW host-galaxy use case`
- [ ] **Body:**

```
Dear Dr. Dálya,

I've built skymap, an open-source browser-based 3D explorer for
several galaxy catalogs.  GLADE is one of the three I load (alongside
SDSS and 2MRS), and it's the most useful of the three for the use
case I find personally most interesting: scanning the
gravitational-wave EM-counterpart host-candidate volume in 3D rather
than projected onto the sky.

The use case I write up in the README is exactly the one your group
designed GLADE for — so I wanted to flag the project to you directly,
both as an acknowledgement and because feedback from someone closer
to the actual GW follow-up community would be invaluable.

Live: https://skymap.rulkens.com
Source: https://github.com/rulkens/skymap
DOI: https://doi.org/10.5281/zenodo.NNNNNNNN

It's a personal learning project, not a polished product, so I'd
welcome bluntness about where the GW host-candidate framing falls
short.  If there are GW-follow-up groups (GROWTH, ENGRAVE, others)
where it would be worth posting a pointer, I'd be grateful for the
introduction.

With thanks for GLADE,
Alexander Rulkens
rulkens@gmail.com
```

- [ ] **Verify:** addressee email confirmed before sending (check the GLADE+ MNRAS paper's corresponding-author footnote).

### Step 5.3: Email 3 — AAS WorldWide Telescope team (Peter Williams)

- [ ] **To:** Peter Williams at AAS (`pwilliams@aas.org` — confirm at https://www.aas.org/about/staff before sending)
- [ ] **Subject:** `Skymap (browser WebGPU 3D galaxy explorer) — possible AAS WWT community list?`
- [ ] **Body:**

```
Dear Peter,

I've been following the AAS WWT renewal effort with a lot of
admiration.  I wanted to share a small open-source project that
overlaps the browser-astronomy-tool space: skymap, an interactive
WebGPU 3D explorer for SDSS, 2MRS, and GLADE galaxy catalogs.

Live: https://skymap.rulkens.com
Source: https://github.com/rulkens/skymap
DOI: https://doi.org/10.5281/zenodo.NNNNNNNN
JOSS submission: in progress

It's not a WWT alternative — WWT is a far broader platform — but it
does occupy a free-exploration, 3D, no-install niche that I think
complements the WWT toolkit.  If there's an AAS-maintained list of
community-built browser tools, or any guidance on submitting to one,
I'd appreciate the pointer.

Recent traction on Hacker News [link if Show HN worked] suggests there
is real public appetite for "open the browser, see the galaxies"
tools, which I think bodes well for the WWT mission.

Best regards,
Alexander Rulkens
rulkens@gmail.com
```

- [ ] **Verify:** if Show HN didn't get traction, _delete the "Recent traction on Hacker News" sentence entirely_ before sending.

### Step 5.4: Email 4 — CDS Strasbourg / Aladin team

- [ ] **To:** Thomas Boch (`thomas.boch@astro.unistra.fr`) and Pierre Fernique (`pierre.fernique@astro.unistra.fr`) — both are the CDS Aladin maintainers.
- [ ] **Subject:** `Skymap — a WebGPU 3D viewer using hips2fits; awareness + interop?`
- [ ] **Body:**

```
Dear Thomas and Pierre,

I'm an independent developer with a small project that depends
heavily on CDS infrastructure.  Skymap is a browser-based 3D
explorer for SDSS, 2MRS, and GLADE galaxy catalogs, built on WebGPU.
For 2MRS and GLADE galaxies (which have no native CORS-permitted
thumbnail source), I fetch DSS cutouts via your hips2fits endpoint —
which has been *the* enabling piece of infrastructure for this part
of the project.  Thank you.

Live: https://skymap.rulkens.com
Source + acknowledgements: https://github.com/rulkens/skymap
DOI: https://doi.org/10.5281/zenodo.NNNNNNNN

Two questions, no hurry on either:

1. Is there a CDS-maintained listing of community tools that build on
   VizieR / hips2fits / Aladin Lite where skymap might fit?  Awareness
   among the CDS user community would be valuable; I'd accept a
   "thanks but no" gracefully.
2. If I added VOTable export of the current selection or a hips2fits
   "open this region in Aladin Lite" deep-link, would either be
   actually useful to your users, or just clutter?  I'm genuinely
   unsure of the priority.

The project is a personal learning effort; I'm not pitching it as
infrastructure.  Feedback in any direction welcome.

With thanks for CDS,
Alexander Rulkens
rulkens@gmail.com
```

- [ ] **Verify:** confirm both addresses on the CDS team page (https://cds.unistra.fr/) before sending — they sometimes change.

### Step 5.5: Email 5 — LIGO-Virgo-KAGRA EM follow-up (GROWTH / ENGRAVE)

- [ ] **To:** Either the GROWTH coordinator (Mansi Kasliwal, Caltech — `mansi@astro.caltech.edu`) or the ENGRAVE coordination email (`engrave@ligo.org`). Choose one initially; if both come back warm, that's fine. Don't BCC both at once.
- [ ] **Subject:** `Browser 3D explorer for GLADE — GW host-candidate use case, feedback welcome`
- [ ] **Body:**

```
Dear [Dr. Kasliwal / ENGRAVE coordination team],

I've built skymap, an open-source browser tool that I think has a
small but real use case in EM-follow-up triage: a 3D interactive
explorer of the GLADE catalog (~3M galaxies, all-sky), running
directly in Chrome / Edge via WebGPU with no install.

The intended workflow: given a GW localisation contour, you orbit
the GLADE volume, see candidate hosts in 3D, click for redshift +
NED link, get a sense of which structures (clusters, walls) actually
intersect the contour rather than just the projected sky region.

Live: https://skymap.rulkens.com
Source: https://github.com/rulkens/skymap
DOI: https://doi.org/10.5281/zenodo.NNNNNNNN

Important caveats: skymap currently has no GW skymap overlay —
that's a near-term feature I want to add but it's not there yet.  I
am aware that real follow-up triage runs through TreasureMap, GW
Skynet, gracedb, and bespoke pipelines.  This is meant as a
rapid-orientation companion, not a replacement.

If anyone in your group has a few minutes to look and tell me whether
adding a Multi-Order HEALPix skymap overlay would actually be useful
for triage (vs. people just using treasuremap.space), I'd be very
grateful for the steer.

Best regards,
Alexander Rulkens
rulkens@gmail.com
```

- [ ] **Verify** — _do not_ claim skymap has a GW skymap overlay if it doesn't. The body above is honest about the gap; keep it that way.

### Step 5.6: Send-all checklist

- [ ] **Substitute the real Zenodo DOI** in all five emails (do this once with `sed` against a draft file or use email-template merging).

- [ ] **Send each email individually**, not as a single thread. Spread them over 3-5 days; an inbox flood from a stranger looks like a mailing-list robot.

- [ ] **Verify by checking your sent-mail folder** that no email retains the literal string `NNNNNNNN`. Spot-check one or two for typos before sending the rest.

- [ ] **Track replies in a simple text log** at `~/.claude/projects/-Users-rulkens-Development-js-skymap/memory/outreach_log.md` — date sent, recipient, reply summary. Update when responses come in. (This is project memory only; don't commit it to the repo.)
