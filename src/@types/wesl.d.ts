// `import wgsl from './x.wesl?static'` resolves to the linked WGSL string
// (tools/utils/vite/weslStaticPlugin.ts).
declare module '*.wesl?static' {
  const wgsl: string;
  export default wgsl;
}
