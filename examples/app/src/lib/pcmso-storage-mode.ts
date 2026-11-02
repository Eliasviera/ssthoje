export type PcmsoStorageMode = "json" | "postgres";

export function getPcmsoStorageMode(value = process.env.SST_PCMSO_STORAGE): PcmsoStorageMode {
  return value === "postgres" ? "postgres" : "json";
}
