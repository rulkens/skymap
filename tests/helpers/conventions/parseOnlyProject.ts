/**
 * The source-sweep convention tests share ONE ts-morph project whose options
 * keep it parse-only: no tsconfig, no import-graph resolution, so adding a file
 * costs a parse and never builds a `ts.Program`. Type-checker APIs
 * (`getExportedDeclarations`, `getType`) on a resolving project are what made
 * these sweeps ~85% of the suite — reach for a syntactic API instead.
 */
import { Project } from 'ts-morph';

export const parseOnlyProject = new Project({
  skipAddingFilesFromTsConfig: true,
  skipFileDependencyResolution: true,
  compilerOptions: {},
});
