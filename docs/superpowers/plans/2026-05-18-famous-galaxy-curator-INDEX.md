# Famous Galaxy Curator — Plan Index

> **For agentic workers:** This feature ships as four sub-plans. Execute them in dependency order (A → B → C → D); plans B and C can run in parallel after A lands. Each sub-plan is itself a TDD task list designed for `superpowers:subagent-driven-development`.

The Famous Galaxy Curator is a local-only Vite dev tool (port 5200) that walks the maintainer through curating thumbnails for the 75-entry Famous catalog: paste a URL, crop on canvas, tune StarNet + alpha sliders, click Export. Spec: `docs/superpowers/specs/2026-05-18-famous-galaxy-curator-design.md`. Splitting the work into four plans keeps each one in the "small enough to hold in one head" range and lets each one produce verifiable, working software.

Plan A lays the foundation (pure helpers, plugin scaffold, directory tree). Plan B adds API endpoints on top of that scaffold so the server is fully exercisable via curl. Plan C builds the React UI, which can begin in parallel with Plan B by stubbing endpoints. Plan D wires the curator into the existing `fetchFamousImages` pipeline, adds a Playwright smoke test, and runs the visual styling pass via the `superpowers:frontend-design` skill.

```
                   ┌──────────────────────────────────────┐
                   │  A — Foundation                       │
                   │  (helpers + plugin scaffold + dir)    │
                   └────────────┬─────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                ▼                               ▼
   ┌───────────────────────┐       ┌───────────────────────┐
   │  B — API endpoints     │       │  C — UI                │
   │  (fetch/process/export)│       │  (panels + crop canvas)│
   └────────────┬───────────┘       └────────────┬───────────┘
                │                                │
                └───────────────┬────────────────┘
                                ▼
              ┌──────────────────────────────────────┐
              │  D — Integration & polish             │
              │  (fetchFamousImages hook + Playwright │
              │   + frontend-design styling pass)     │
              └──────────────────────────────────────┘
```

## Plans

| Plan | File | Depends on |
| ---- | ---- | ---------- |
| A — Foundation | `2026-05-18-famous-galaxy-curator-a-foundation.md` | — |
| B — API endpoints | `2026-05-18-famous-galaxy-curator-b-api.md` | A merged |
| C — UI | `2026-05-18-famous-galaxy-curator-c-ui.md` | A merged (B can be in flight; UI stubs allowed) |
| D — Integration & polish | `2026-05-18-famous-galaxy-curator-d-integration.md` | B and C merged |

## Branch + PR strategy

One feature branch per sub-plan, one PR per sub-plan. Plan A merges to `main` first; Plan B and Plan C then branch from `main` and can run in parallel (their files don't overlap — B touches `tools/famous-curator/plugin/`, C touches `tools/famous-curator/ui/`). Plan D branches after both B and C land. Each PR is small enough to review end-to-end in one sitting.
