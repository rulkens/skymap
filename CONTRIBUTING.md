# Contributing to skymap

Thanks for your interest in skymap. This page is the way in: why the project exists, how
to get running, and how changes land.

## Why this exists

Skymap puts the measured universe in anyone's hands: students, teachers, planetarium
audiences, anyone curious. It is built to last, and every change is held to three tests:

- **Can we keep building on it?** Leave each file clearer than you found it, and finish
  what you start: no half-renames, no old and new code left standing side by side.
- **Could a new developer pick it up cold?** If the why isn't in the code, the docs or an
  ADR, the work isn't done.
- **Would a user come back?** A bug a user sees costs more than a feature that ships late,
  so never trade reliability for landing speed.

When you pass quality debt (a stale branch, a flaky test, dead code, an unclear name),
say so in your PR or an issue. Don't build around it.

## Getting started

Follow the [README quickstart](README.md#quickstart): `npm install`, `npm run fetch-data`
for the real catalogs, `npm run dev`. The README's
[Finding your way around](README.md#finding-your-way-around) maps the source tree.

Before changing an area, read its guide:

| You're touching                         | Read first                                          |
| --------------------------------------- | --------------------------------------------------- |
| Renderer, shaders, `src/services/gpu/`  | [docs/RENDERER.md](docs/RENDERER.md)                |
| Data pipeline, `tools/`, `data/`        | [docs/DATA.md](docs/DATA.md)                        |
| Anything a person sees or operates      | [ui-ux.md](docs/superpowers/conventions/ui-ux.md)   |
| Where state lives and who may change it | [intent.md](docs/superpowers/conventions/intent.md) |
| Deploys, R2, caching                    | [docs/DEPLOY.md](docs/DEPLOY.md)                    |

Past architectural decisions, and why they were made, are in [docs/adrs/](docs/adrs/).

## How we write code

The full conventions live in [docs/superpowers/conventions/](docs/superpowers/conventions/)
and are summarised in [CLAUDE.md](CLAUDE.md), which also serves the AI assistants that
work on this repo. The ones that shape most reviews:

- **Simplicity over ease** ([simplicity.md](docs/superpowers/conventions/simplicity.md)):
  judge a design by the result, not by how easy it was to write; keep concerns that could
  change independently apart.
- **Code is liability** ([leanness.md](docs/superpowers/conventions/leanness.md)): the
  smallest diff wins, deleting beats adding, and speculative options are review findings.
- **Test what can break** ([testing.md](docs/superpowers/conventions/testing.md)): a test
  earns its place by catching a real bug nothing else catches. A bug fix starts as a
  failing test.
- **Comments explain why, never what** ([comments.md](docs/superpowers/conventions/comments.md)).
- **Strict TypeScript** in `src` and `tools`, with no `any` you could avoid; `type`
  aliases, never `interface`.
- **One symbol per file** in `utils/` and `@types/`, and no barrel files.

## Making a change

1. Typo fixes, doc tweaks and small bug fixes can go straight to a PR. For anything bigger
   (a feature, a refactor, a new dependency, a behaviour change), open an issue first so
   we can agree the approach before code is written. Check
   [docs/BACKLOG.md](docs/BACKLOG.md) and `docs/superpowers/plans/` so you build on what
   exists; a substantial feature gets a written plan before code.
2. Work on a branch and open a draft PR early.
3. Before asking for review, run `npm run typecheck`, `npm run lint`, `npm test` and
   `npm run format`. CI runs the same checks (plus the website build) and is the gate.
4. Update the docs your change makes stale in the same PR.
5. For anything visible, include before/after screenshots (`npm run shot`) with the deep
   link that reproduces them.
