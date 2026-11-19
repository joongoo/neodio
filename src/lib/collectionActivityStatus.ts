export type CollectionActivityStatus =
  | { status: "ready"; running: boolean; attention: boolean }
  | { status: "loading" | "unavailable" };
