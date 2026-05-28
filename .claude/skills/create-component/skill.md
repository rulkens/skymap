---
name: create-component
description: Create a new React component in `src/components/` following skymap's conventions — own folder, `<Name>.tsx` + `<Name>.module.css`, single-component-per-file, `function Name() {}` + `export default Name`, top-level `.root` class. Use when the user types `/create-component`, asks to "make a component", "add a component", "extract this into a component", or "split this component up". Also use proactively whenever a component file is growing past ~120 lines or starts handling more than one concern — the *right* time to create a new component is before the parent gets messy, not after.
---

# `/create-component` — Create a React component, the skymap way

## Why this skill exists

Without rules, components in `src/components/` drift toward god-files: a 250-line
`Splash.tsx` ends up containing the dialog markup, an inline `ProgressRow`, a
focus-trap effect, error rendering, the CTA cluster, and the footer — all in
one file. Reviewing it is hard, testing pieces in isolation is harder, and
reusing the `ProgressRow` somewhere else means a copy-paste. This skill encodes
the small, boring conventions that prevent that drift and the *posture* of
creating new components early rather than letting one balloon.

## The conventions

These are project-wide. The reasoning under each is what makes them stick — if
a rule's reason doesn't apply in some unusual context, surface that to the
user rather than silently bending the rule.

### 1. One folder per component

`src/components/<ComponentName>/`. Lives next to its CSS module, its tests, and
any sub-components that are scoped to it. Folder name matches the component
name 1:1 — singular, PascalCase, no `Component` suffix.

### 2. One file per component

`<ComponentName>.tsx` exports exactly one React component. If a second
component appears in the file (an `InfoIcon` inline in AboutPill, a
`ProgressRow` inline in Splash), move it to its own file in the same folder.
If it's reusable across features, move it to `src/components/common/`.

Why: two components in one file pollute import autocomplete (you see both
when typing the file name), break grep-by-filename, and the second component
never gets its own test because it isn't independently importable without
exporting it explicitly.

### 3. Default export with the function-declaration form

Always:

```tsx
function ComponentName(props: ComponentNameProps): ReactNode {
  // …
}

export default ComponentName;
```

Not `export const X = () => …`, not `export function X(…)`.

Why: function declarations give a real `.name` for React DevTools (arrow
functions assigned to a const often show as `Anonymous` in the inspector),
they hoist cleanly, and parking the default export at the bottom of the
file keeps the answer to "what does this file give me?" in one obvious
place.

If the component needs `memo` (high-frequency parent re-renders), wrap on
the way out:

```tsx
function ComponentName(props: ComponentNameProps): ReactNode { /* … */ }
export default memo(ComponentName);
```

### 4. Named-export the props type at the top of the file

```tsx
export type ComponentNameProps = {
  readonly title: string;
  readonly onDismiss: () => void;
};
```

Named so other components can import it. Always `type`, never `interface`
(project convention — see CLAUDE.md). Default to `readonly` and drop it
only when the field is genuinely mutated from inside.

### 5. CSS module sibling, with a top-level `.root` class

Every component has `<ComponentName>.module.css`, and the outermost element
renders `className={styles.root}` (composed with other classes via `cx`
when needed). All other class names live underneath `.root` in the file:

```css
/* src/components/MyThing/MyThing.module.css */
.root {
  display: flex;
  gap: 12px;
}

.title { /* … */ }
.body  { /* … */ }
```

Why a fixed name: when a parent needs to compose a component (style its
positioning from outside, target it in a snapshot test, or read the
outermost element in dev tools), `.root` is the single predictable hook.
Without it you end up reading the JSX to figure out which class is the
outermost one (`.backdrop`? `.card`? `.wrapper`?), and every component
answers it differently.

### 6. Destructure props inline

```tsx
function MyThing({ title, onDismiss, count = 0 }: MyThingProps): ReactNode {
  return /* … */;
}
```

Not `function MyThing(props: MyThingProps) { const { title, ... } = props; }`.
Inline keeps the prop list visible at the function signature, where the
default values, types, and used fields all land in one place. The
body-destructuring form adds a noise line for zero benefit.

Exception: a wide prop set (>~8 fields) is more readable destructured into
the body so the signature stays short.

### 7. No barrel exports

Import directly from the `.tsx`:

```tsx
import MyThing from '../MyThing/MyThing';
```

Don't create `index.ts` re-exports inside component folders (CLAUDE.md).

### 8. No global CSS

All styling goes in `<ComponentName>.module.css` (CSS Modules). Never
edit `src/styles/global.css` or any other top-level stylesheet from a
component change. Never write global selectors (`:global(.foo)` /
unscoped `body button { … }` rules) inside a module either — they leak
out of the file's scope and undo the entire point of CSS Modules.

Why: global CSS is the dominant source of UI regressions on this
project — one component's tweak silently restyles another surface a
screen away, and the dev-tools trail to "who set this rule" is cold.
Module-local rules can't reach past their own file, so the blast radius
of any styling decision matches the blast radius of the component.

`src/styles/global.css` is for design tokens (CSS custom properties)
and the body / html reset only. If you find yourself wanting to add a
*rule* there to support a component, the rule belongs in the
component's module instead.

### 9. Comments: minimal, timeless, didactic

Default to no comments. A module-header docblock is welcome when the
component's *purpose* or *non-obvious constraint* is worth recording; the
rest of the file should be self-explanatory through naming.

When you do write a comment, follow the project's comment style:

- **Terse over verbose.** A punchy line beats a paragraph.
- **Explain the *why* and what the alternative was**, not the *what* — the
  code already shows what (this is the project's didactic-comments
  convention; see CLAUDE.md).
- **Timeless.** No dates, no PR references, no "previously this was X"
  /"pre-refactor" notes. The git log is the changelog; comments describe
  the current state.
- **Don't restate the JSX or class names.** `// the title` above
  `<h1 className={styles.title}>` is pure noise.
- **Don't comment props that read trivially from their name + type.**
  `readonly onDismiss: () => void;` doesn't need a docblock; a non-obvious
  semantic one (`/** Fires on Esc too — see useFocusTrap. */`) does.

In short: write the comment only if removing it would confuse a future
reader. Erring on the side of fewer is correct.

## When to create a new component (the posture)

**Create early, not late.** A component should do one thing. Heuristics for
"extract now":

- The file is past ~120 lines of JSX + logic and you're about to add more.
- You can name a chunk of JSX with a noun that isn't the parent's name
  (`ProgressRow`, `ErrorBox`, `CtaGroup`, `Footer`). If it has a name,
  it's a component.
- The same shape of markup is starting to appear twice. Second time = lift it.
- A chunk has its own state, effect, or event handlers that aren't shared
  with siblings. The handler set is a tell.
- A chunk needs its own tests but the parent's tests are about something
  else.

**Layout primitives live in `src/components/common/`.** Currently present:
`Panel`, `PaletteSelect`. Generic things like `Button`, `Stack`, `Row`,
`Pill`, `IconButton`, `Badge`, `ErrorBox`, `Spinner` belong here when they
land. Look in `common/` *before* writing a layout chunk in a feature folder
— there's a good chance the primitive already exists or is one step away
from existing.

## What the skill does

1. **Confirm the name.** PascalCase, no `Component` suffix. `Splash` not
   `SplashComponent`. If the user gave an ambiguous name (`Modal`?
   `Dialog`?), surface the choice.

2. **Pick the folder.** Default: `src/components/<Name>/`. If the
   component is clearly a layout primitive (Button, Stack, Row, Pill,
   IconButton, Badge, etc.), put it under `src/components/common/<Name>/`
   and say so.

3. **Check the path is free.** If `src/components/<Name>/<Name>.tsx`
   already exists, stop and surface it — the user is either renaming
   something or doesn't realise the component exists. Don't overwrite.

4. **Scaffold:**

   ```
   src/components/<Name>/<Name>.tsx
   src/components/<Name>/<Name>.module.css
   ```

   Test file is **not** scaffolded by default — see "tests" below.

5. **Write `<Name>.tsx`** using the canonical template (next section).

6. **Write `<Name>.module.css`** with a `.root` rule. Empty body is fine
   — the class exists as the hook even before any styles are needed.

7. **Report** what was created and how to import it from the parent:

   ```
   Created src/components/<Name>/{<Name>.tsx, <Name>.module.css}
   Import: `import <Name> from './<Name>/<Name>';`
   ```

8. **If extracting from an existing component** (the common case), also
   do the extraction on the parent in this order:

   1. Write the new component file (steps 4–6 above).
   2. Add the import to the parent.
   3. Replace the inline JSX with `<NewComponent {...props} />`.
   4. Remove the now-unused state / handlers / sub-functions from the
      parent.
   5. Run `npm run typecheck` and `npm test -- <Parent>`.
   6. Commit with a single-purpose message (`refactor(<parent>): extract
      <NewComponent>`).

   Doing the import + replacement in one pass before removing the dead
   code prevents leaving the parent half-broken if something goes wrong
   mid-edit.

**Tests:** default to no test file. The vast majority of components in
this project are thin presentational wrappers (pill buttons, icons,
labels, layout primitives) where a test would do little more than
re-encode the JSX in a different syntax. Skip them.

A test file is warranted only when the component carries real logic
the user can observe: a focus trap, an Esc handler, an error-state
branch, a derived counter, a click-outside dismiss. In other words —
*behaviour* the parent's test wouldn't naturally cover. Splash and
SettingsPanel are examples; AboutPill, AutoRotateToggle, PillButton,
PlayIcon are not.

When in doubt, ask the user — they would rather skip a marginal test
than carry one.

## Canonical template

Concrete example first, abstract template below.

### Worked example: extracting `ProgressRow` from Splash

`src/components/Splash/ProgressRow.tsx`:

```tsx
// src/components/Splash/ProgressRow.tsx
/**
 * ProgressRow — determinate or indeterminate load-progress strip.
 *
 * Renders a thin track with a fill bar plus a "%/Loading…" label.
 * Determinate when `totalBytes > 0`; otherwise an animated
 * indeterminate sweep.
 */

import type { ReactNode } from 'react';
import type { LoadProgressState } from '../../@types/loading/LoadProgressState';
import styles from './ProgressRow.module.css';

export type ProgressRowProps = {
  readonly progress: LoadProgressState | null;
};

function ProgressRow({ progress }: ProgressRowProps): ReactNode {
  if (!progress) return null;
  const indeterminate = progress.totalBytes === 0;
  const fraction =
    progress.totalBytes > 0
      ? Math.min(1, progress.loadedBytes / progress.totalBytes)
      : 0;
  return (
    <div
      className={styles.root}
      role="progressbar"
      aria-label="Loading galaxy data"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(fraction * 100)}
    >
      <div className={styles.track}>
        {indeterminate ? (
          <div className={styles.indeterminate} />
        ) : (
          <div className={styles.fill} style={{ width: `${fraction * 100}%` }} />
        )}
      </div>
      <span>{indeterminate ? 'Loading…' : `${Math.round(fraction * 100)}%`}</span>
    </div>
  );
}

export default ProgressRow;
```

`src/components/Splash/ProgressRow.module.css`:

```css
.root {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--color-fg-muted, #9aa3b3);
}

.track {
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
}

.fill {
  height: 100%;
  background: var(--color-accent);
  transition: width 0.2s ease-out;
}

.indeterminate {
  height: 100%;
  width: 30%;
  background: linear-gradient(
    90deg,
    transparent,
    var(--color-accent),
    transparent
  );
  animation: indeterminate 1.4s ease-in-out infinite;
}

@keyframes indeterminate {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}
```

Then in `Splash.tsx`, the import + usage:

```tsx
import ProgressRow from './ProgressRow';
// …
{hardError ? <ErrorBox … /> : <ProgressRow progress={loadProgress} />}
```

### Abstract template

Substitute every `ComponentName` (and the lowercase variants in paths) with
the real name before writing. The angle-bracket markers in the workflow
above are human-readable hints, not literal output — never write `<Name>`
or `<ComponentName>` into the final files.

```tsx
// src/components/ComponentName/ComponentName.tsx
/**
 * ComponentName — one-line purpose.
 *
 * 2–4 line module header explaining why it exists, what it owns,
 * and what it deliberately doesn't own. Match the rest of the
 * codebase's didactic comment style — see CLAUDE.md.
 */

import type { ReactNode } from 'react';
import styles from './ComponentName.module.css';

export type ComponentNameProps = {
  readonly /* fields */: /* types */;
};

function ComponentName({ /* destructure inline */ }: ComponentNameProps): ReactNode {
  return (
    <div className={styles.root}>
      {/* … */}
    </div>
  );
}

export default ComponentName;
```

```css
/* src/components/ComponentName/ComponentName.module.css */

.root {
  /* outermost styles — display, layout, sizing */
}
```

## When you encounter a component that violates the conventions

Don't silently rewrite it as a side quest — surface the specific extractions
to the user first, with concrete file names:

> "`Splash.tsx` is 250 lines and contains an inline `ProgressRow`, an
> `ErrorBox`, and a CTA cluster. I'd like to extract `ProgressRow` →
> `src/components/Splash/ProgressRow/`, `ErrorBox` →
> `src/components/common/ErrorBox/`, and `CtaGroup` →
> `src/components/Splash/CtaGroup/`. Want me to?"

If the answer is yes, run this skill once per extraction, in dependency
order (deepest leaves first so the parent's intermediate states still
compile). The 8-step extraction sequence in "What the skill does" applies
to each one.

## Anti-patterns (quick-reference card)

Reinforcement of the rules above — handy during PR review and when reading
existing code. Each one points back to a rule explaining the *why*.

- **Arrow-function components** (`export const X = () => …`) — see rule 3.
- **`interface` for props** — `type` only. Rule 4.
- **Omitting `.root`** because "the component is small" — rule 5.
- **`index.ts` barrel re-exports** — rule 7.
- **Editing `src/styles/global.css`** or writing `:global(.foo)` rules
  inside a module to support a component — rule 8.
- **Scaffolding a test file for a thin presentational wrapper** — see
  "Tests" under "What the skill does"; default is no test file.
- **Plural folder names** (`Splashes/`) or `Component` suffix
  (`SplashComponent/`) — rule 1.
- **Two components in one file**, even tightly-coupled ones — rule 2.
- **Layout primitives in feature folders** — see the "posture" section;
  `common/` is the home for reusables.
- **Waiting until 300 lines to extract** — the posture section's heuristics.
  Cost of one extraction now is small; cost of extracting after the
  parent's tests have grown around the inline shape is large.

## Related skills

- `/dev` — start the Vite dev server to see the new component render.
- `/link-data` — make sure the worktree has real catalog data when the new
  component needs to be visually verified.

## See also

- `CLAUDE.md` "Project conventions" — the `type`-not-`interface` rule, the
  no-barrel-exports rule, the didactic-comments rule.
- `src/components/common/` — the existing layout primitives. Look here
  before writing a new one.
