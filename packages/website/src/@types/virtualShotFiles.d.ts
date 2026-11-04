// The shot files in public/shots/, keyed `<name>-<width>.<ext>` (tools/site/shotFiles.ts).
declare module 'virtual:shot-files' {
  const files: Readonly<Record<string, string>>;
  export default files;
}
