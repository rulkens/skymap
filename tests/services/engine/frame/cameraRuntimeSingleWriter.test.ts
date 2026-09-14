/**
 * cameraRuntimeSingleWriter — no file under `src/` writes into the camera
 * runtime except `runFrame` (installs `stepCameraRuntime`'s `next`, once a
 * frame) and `wireInput` (seeds it, once at boot). Covers writes through the
 * field AND through a local alias: six sagas bind one, and none of them runs
 * under the harness whose `deepFreeze` would otherwise catch it. `engine.ts`
 * needs no allow-list entry — it only BINDS the runtime; binding is not
 * writing. Out of scope: destructuring targets, `delete`, and `tests/`. An AST
 * assertion, not a grep, under testing.md's "cross-file contract" keep-rule.
 */
import { describe, it, expect } from 'vitest';
import { Project, SyntaxKind, Node, type SourceFile } from 'ts-morph';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FIELD = 'cameraRuntime';

// `=` plus every compound form. A compound assignment into a numeric leaf
// (`state.cameraRuntime.outputs.simDays += 1`) is the same second writer as a
// plain one, and reads as an "adjustment" that a reviewer waves through.
const ASSIGNMENT_TOKENS: readonly SyntaxKind[] = [
  SyntaxKind.EqualsToken,
  SyntaxKind.PlusEqualsToken,
  SyntaxKind.MinusEqualsToken,
  SyntaxKind.AsteriskEqualsToken,
  SyntaxKind.AsteriskAsteriskEqualsToken,
  SyntaxKind.SlashEqualsToken,
  SyntaxKind.PercentEqualsToken,
  SyntaxKind.LessThanLessThanEqualsToken,
  SyntaxKind.GreaterThanGreaterThanEqualsToken,
  SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
  SyntaxKind.AmpersandEqualsToken,
  SyntaxKind.BarEqualsToken,
  SyntaxKind.CaretEqualsToken,
  SyntaxKind.AmpersandAmpersandEqualsToken,
  SyntaxKind.BarBarEqualsToken,
  SyntaxKind.QuestionQuestionEqualsToken,
];

function walk(dir: string, extensions: readonly string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p, extensions);
    return extensions.some((ext) => p.endsWith(ext)) ? [p] : [];
  });
}

// DERIVED by sweeping the directories that hold every engine/state/UI path with
// a handle on EngineState — a new file dropped into any of them is gated with
// no hand-edit here.
const TS_FILES: readonly string[] = [
  ...walk('src/services', ['.ts', '.tsx']),
  ...walk('src/state', ['.ts', '.tsx']),
  ...walk('src/store', ['.ts', '.tsx']),
  ...walk('src/hooks', ['.ts', '.tsx']),
  ...walk('src/components', ['.ts', '.tsx']),
];

// A typo'd dir/extension sweeps zero files and the whole test passes vacuously
// — assert the sweep found real content, and specifically the writers and the
// near-miss neighbours this gate was written about.
const KNOWN_ANCHOR_FILES: readonly string[] = [
  'src/services/engine/frame/runFrame.ts',
  'src/services/engine/phases/wireInput.ts',
  'src/services/engine/engine.ts',
  'src/services/engine/camera/cameraDrivers.ts',
  'src/services/engine/camera/replayInput.ts',
  'src/services/engine/camera/stepCameraRuntime.ts',
];

const ALLOW_LIST: ReadonlyMap<string, string> = new Map([
  ['src/services/engine/frame/runFrame.ts', "the frame's one install of stepCameraRuntime's next"],
  ['src/services/engine/phases/wireInput.ts', 'the boot seed, once, at bootstrap'],
]);

const project = new Project({ useInMemoryFileSystem: false });

/** Strip the wrappers that would otherwise hide a chain: `!`, `(…)`, `as X`. */
function unwrap(node: Node): Node {
  let cursor = node;
  while (
    Node.isNonNullExpression(cursor) ||
    Node.isParenthesizedExpression(cursor) ||
    Node.isAsExpression(cursor)
  ) {
    cursor = cursor.getExpression();
  }
  return cursor;
}

/** True when this link is `.cameraRuntime` or `['cameraRuntime']`. */
function linkNamesField(cursor: Node): boolean {
  if (Node.isPropertyAccessExpression(cursor)) return cursor.getName() === FIELD;
  if (!Node.isElementAccessExpression(cursor)) return false;
  const arg = cursor.getArgumentExpression();
  return arg !== undefined && Node.isStringLiteral(arg) && arg.getLiteralValue() === FIELD;
}

/** Walk a member chain to its root identifier, noting whether it names the field. */
function chainOf(target: Node): { readonly root: Node; readonly namesField: boolean } {
  let cursor = unwrap(target);
  let namesField = false;
  while (Node.isPropertyAccessExpression(cursor) || Node.isElementAccessExpression(cursor)) {
    if (linkNamesField(cursor)) namesField = true;
    cursor = unwrap(cursor.getExpression());
  }
  return { root: cursor, namesField };
}

/**
 * Walks an initialiser's SPINE — call callees and member chains, never a
 * literal's contents. Whole-subtree text would make `engine.ts`'s
 * `const state = { …, cameraRuntime, … }` an alias and flag every unrelated
 * `state.subsystems.x = null` in the teardown.
 */
function initializerRefersToRuntime(initializer: Node, aliases: ReadonlySet<string>): boolean {
  let cursor = unwrap(initializer);
  for (;;) {
    if (Node.isCallExpression(cursor)) {
      cursor = unwrap(cursor.getExpression());
    } else if (Node.isPropertyAccessExpression(cursor) || Node.isElementAccessExpression(cursor)) {
      if (linkNamesField(cursor)) return true;
      cursor = unwrap(cursor.getExpression());
    } else break;
  }
  return Node.isIdentifier(cursor) && (cursor.getText() === FIELD || aliases.has(cursor.getText()));
}

/**
 * Names standing for the runtime — purely syntactic, so a saga's
 * `const cameraRuntime = yield* getContext(…)` then `const rt = cameraRuntime()!`
 * both count with no type-level resolve. Source order matters: the second
 * binding is only an alias because the first already is. Destructured bindings
 * have no identifier name node and are skipped rather than half-covered.
 */
function aliasNames(sourceFile: SourceFile): ReadonlySet<string> {
  const names = new Set<string>();
  for (const decl of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const nameNode = decl.getNameNode();
    if (!Node.isIdentifier(nameNode)) continue;
    const initializer = decl.getInitializer();
    if (
      nameNode.getText() === FIELD ||
      (initializer !== undefined && initializerRefersToRuntime(initializer, names))
    ) {
      names.add(nameNode.getText());
    }
  }
  return names;
}

/** `file:line — source` for every assignment or Object.assign into the runtime. */
function writesToCameraRuntime(file: string): string[] {
  const sourceFile = project.addSourceFileAtPath(file);
  const aliases = aliasNames(sourceFile);
  const hitsRuntime = (target: Node): boolean => {
    const { root, namesField } = chainOf(target);
    return namesField || (Node.isIdentifier(root) && aliases.has(root.getText()));
  };

  const assignments = sourceFile
    .getDescendantsOfKind(SyntaxKind.BinaryExpression)
    .filter((node) => ASSIGNMENT_TOKENS.includes(node.getOperatorToken().getKind()))
    .filter((node) => {
      // A MEMBER write only. Re-binding the alias itself (`rt = {…}`) drops the
      // reference; it cannot reach the runtime the engine holds.
      const lhs = unwrap(node.getLeft());
      const member = Node.isPropertyAccessExpression(lhs) || Node.isElementAccessExpression(lhs);
      return member && hitsRuntime(lhs);
    });
  // `Object.assign(target, …)` mutates `target`, so a bare alias counts here.
  const objectAssigns = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((node) => node.getExpression().getText() === 'Object.assign')
    .filter((node) => {
      const target = node.getArguments()[0];
      return target !== undefined && hitsRuntime(target);
    });
  return [...assignments, ...objectAssigns].map(
    (node) => `${file}:${node.getStartLineNumber()} — ${node.getText().split('\n')[0]}`,
  );
}

describe('nothing under src writes the camera runtime but runFrame and wireInput', () => {
  it('the directory sweep found real files, including each known anchor', () => {
    // Five swept dirs (~750 files); 400 leaves ample margin below the true
    // count while still catching an empty or typo'd walk.
    expect(TS_FILES.length).toBeGreaterThan(400);
    for (const anchor of KNOWN_ANCHOR_FILES) {
      expect(TS_FILES).toContain(anchor);
    }
  });

  it('no file outside the allow-list writes the runtime, direct or aliased', () => {
    // One assertion rather than a per-file `it.each`: the sweep is ~750 files,
    // and the failure message already names every offending file:line.
    const violations = TS_FILES.filter((f) => !ALLOW_LIST.has(f)).flatMap(writesToCameraRuntime);
    expect(violations).toEqual([]);
  });

  it.each([...ALLOW_LIST.entries()])('%s is a real writer (%s)', (file, _justification) => {
    // An entry that no longer writes is a stale rubber stamp: the file moved,
    // or the write did, and the gate silently stopped covering it.
    expect(writesToCameraRuntime(file).length).toBeGreaterThan(0);
  });

  it('engine.ts binds the runtime without writing it', () => {
    // `const cameraRuntime = seedCameraRuntime(...)` is both the file's alias
    // binding AND the near-miss the alias rule must not turn into a violation:
    // binding is not writing, so nothing here is flagged.
    expect(writesToCameraRuntime('src/services/engine/engine.ts')).toEqual([]);
  });
});
