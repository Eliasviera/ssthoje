export type PgrStorageMode = "json" | "postgres";

// PGR has completed its local cutover; JSON remains an explicit recovery path.
const POSTGRES_RUNTIME_READY = true;

export function getPgrStorageMode(value = process.env.SST_PGR_STORAGE): PgrStorageMode {
  return POSTGRES_RUNTIME_READY && value !== "json" ? "postgres" : "json";
}
