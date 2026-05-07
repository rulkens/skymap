// Activate wesl-plugin's ambient declarations for `?static` etc.
//
// We import these via tsconfig.json `types: ["wesl-plugin/suffixes"]`, but
// that subpath form isn't reliably resolved by every TypeScript version
// when the compilerOptions are picked up by the editor / build separately.
// A triple-slash reference here is the belt-and-braces fallback that
// guarantees resolution from any compiler entry point.
/// <reference types="wesl-plugin/suffixes" />
export {};
