export type SiteStorageMode = "json" | "postgres";

export function getSiteStorageMode(value = process.env.SST_SITE_CMS_STORAGE): SiteStorageMode {
  return value === "json" ? "json" : "postgres";
}
