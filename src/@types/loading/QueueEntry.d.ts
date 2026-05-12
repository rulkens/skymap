export type QueueEntry<T = ImageBitmap | null> = {
  key: string;
  priority: number;
  fetcher: () => Promise<T>;
  onResult: (result: T) => void;
};
