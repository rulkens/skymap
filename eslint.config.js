// eslint.config.js
//
// Narrow, bug-catching lint gate — deliberately NOT eslint:recommended.
//
// TypeScript already runs in `strict` + `noUncheckedIndexedAccess`, so a broad
// style ruleset would only restate what the compiler and Prettier already
// enforce, and would bury the few rules that catch real bugs the type checker
// structurally cannot see. This config carries only those: React's Rules of
// Hooks (a hook behind `||` crashed the app once — the reason this gate exists),
// exhaustive effect deps, and the two type-aware promise rules that catch
// unhandled async work in the engine layer.
//
// Two house conventions ride along as one-line built-ins: `type` over
// `interface`, and no `react-redux` import inside `state/` (the store boundary).
// The remaining file-level conventions (one export per util/@types file,
// filename === export name) live in tests/conventions/ as structural tests —
// a per-file AST linter is the wrong shape for file-level facts.
//
// Scope is `src` + `tools`; `tests/` is excluded because the hooks rules
// false-positive on `useX()` test helpers. The two trees have separate
// tsconfigs, so each gets its own parser block.

import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import comments from '@eslint-community/eslint-plugin-eslint-comments';

// The bug-catching core. Every rule here flags a latent runtime bug, never a
// style preference — which is what lets the gate hard-fail CI on day one.
const CORRECTNESS_RULES = {
  'react-hooks/rules-of-hooks': 'error',
  'react-hooks/exhaustive-deps': 'error',
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
};

// House conventions expressible as stock rules.
const CONVENTION_RULES = {
  '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
};

// Any escape-hatch `eslint-disable` must carry a reason, so a suppression can
// never silently paper over a real finding.
const COMMENT_RULES = {
  '@eslint-community/eslint-comments/require-description': ['error', { ignore: [] }],
};

const plugins = {
  '@typescript-eslint': tseslint.plugin,
  'react-hooks': reactHooks,
  '@eslint-community/eslint-comments': comments,
};

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'public',
      'node_modules',
      'tools/stars-rs/target',
      '**/*.wesl',
    ],
  },

  // Product code → root tsconfig.json (discovered via projectService).
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: { ...CORRECTNESS_RULES, ...CONVENTION_RULES, ...COMMENT_RULES },
  },

  // Build pipeline + dev sub-apps → tsconfig.tools.json (not auto-discovered,
  // since the nearest tsconfig.json up-tree excludes tools/).
  {
    files: ['tools/**/*.{ts,tsx}'],
    plugins,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: './tsconfig.tools.json', tsconfigRootDir: import.meta.dirname },
    },
    rules: { ...CORRECTNESS_RULES, ...CONVENTION_RULES, ...COMMENT_RULES },
  },

  // The store-boundary convention: state/ owns pure RTK slices/selectors/sagas
  // and must not reach for react-redux — that binding lives in store/ + hooks/.
  {
    files: ['src/state/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-redux',
              message:
                'state/ must not import react-redux — the store boundary lives in store/ and hooks/.',
            },
          ],
        },
      ],
    },
  },

  // A disable directive that suppresses nothing is dead weight and usually a
  // stale copy-paste; treat it as an error so the set stays honest.
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
);
