export type StaticServerHandle = {
  url: string;
  close: () => Promise<void>;
};
