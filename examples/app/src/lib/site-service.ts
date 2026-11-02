import "server-only";
import { getPostgresPool } from "./postgres";
import { getPublicSiteContent as getPublicSiteContentJson, getSiteEditor as getSiteEditorJson, changeSiteContent as changeSiteContentJson } from "./site-store";
import { changeSiteContentPostgres, getPublicSiteContentPostgres, getSiteEditorPostgres } from "./site-postgres-store";
import type { SiteContent } from "./site-content";
import { getSiteStorageMode } from "./site-storage-mode";

function requirePostgresPool() {
  const pool = getPostgresPool();
  if (!pool) throw new Error("CMS PostgreSQL indisponível. Confira a configuração local do banco.");
  return pool;
}

export async function getPublicSiteContent() {
  if (getSiteStorageMode() === "json") return getPublicSiteContentJson();
  return getPublicSiteContentPostgres(requirePostgresPool());
}

export async function getSiteEditor(userId: string) {
  if (getSiteStorageMode() === "json") return getSiteEditorJson(userId);
  return getSiteEditorPostgres(requirePostgresPool(), userId);
}

export async function changeSiteContent(userId: string, operation: "save" | "publish", expectedRevision: number, reason: string, content?: SiteContent) {
  if (getSiteStorageMode() === "json") return changeSiteContentJson(userId, operation, expectedRevision, reason, content);
  return changeSiteContentPostgres(requirePostgresPool(), userId, operation, expectedRevision, reason, content);
}
