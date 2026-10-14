/** One request seen through `Network.*` events; fields fill in as the events arrive. */
export type DataRequest = {
  url: string;
  status?: number;
  mimeType?: string;
  bytes?: number; // encodedDataLength: bytes on the wire
  failed?: string; // Network.loadingFailed errorText, e.g. net::ERR_FAILED
};
