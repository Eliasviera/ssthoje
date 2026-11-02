export type ClientStorageMode = "json" | "postgres";

// Keep the switch closed until remaining JSON consumers and audit reads migrate together.
const POSTGRES_RUNTIME_READY = false;

export function getClientStorageMode(value = process.env.SST_CLIENT_STORAGE): ClientStorageMode {
  return POSTGRES_RUNTIME_READY && value === "postgres" ? "postgres" : "json";
}
