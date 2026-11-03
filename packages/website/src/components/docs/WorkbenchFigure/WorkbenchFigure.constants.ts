export const FILES = import.meta.glob<string>('../../../assets/workbenches/*.{avif,webp}', {
  eager: true,
  query: '?url&no-inline',
  import: 'default',
});
