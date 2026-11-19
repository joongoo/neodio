export type CollectionActivityStatus =
  | { status: "ready"; running: boolean; attention: boolean; cancelling?: boolean }
  | { status: "loading" | "unavailable" };
