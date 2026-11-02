import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { requirePlatformMaster, throttle } from "./platform-store.ts";
import { appendAuditEvent } from "./audit-log.ts";
import { DEFAULT_SITE_CONTENT, validateSiteContent, type SiteContent } from "./site-content.ts";
type Snapshot = { revision: number; content: SiteContent };
type SiteDB = { draft: Snapshot; published: Snapshot | null; history: { id: string; operation: "save" | "publish"; actorUserId: string; occurredAt: string; reason: string; before: Snapshot | null; after: Snapshot }[] };
function read(): SiteDB {
  try { return JSON.parse(readFileSync(join(process.cwd(), "data", "site-content.json"), "utf8")) as SiteDB; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { draft: { revision: 0, content: structuredClone(DEFAULT_SITE_CONTENT) }, published: null, history: [] }; throw error; }
}
function write(db: SiteDB) {
  const path = join(process.cwd(), "data", "site-content.json"); mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`; writeFileSync(temp, JSON.stringify(db, null, 2), { flag: "wx" }); renameSync(temp, path);
}
export function getPublicSiteContent(): SiteContent { return structuredClone(read().published?.content ?? DEFAULT_SITE_CONTENT); }
export function getSiteEditor(userId: string) {
  requirePlatformMaster(userId);
  appendAuditEvent({ tenantId: "platform", actorUserId: userId, actorRole: "saas_master", action: "platform.site_read" });
  return structuredClone(read());
}
export function changeSiteContent(userId: string, operation: "save" | "publish", expectedRevision: number, reason: string, content?: SiteContent) {
  requirePlatformMaster(userId); throttle(userId);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || typeof reason !== "string" || !reason.trim() || reason.length > 600 || !["save", "publish"].includes(operation)) throw new Error("Confira a operação e informe uma justificativa fictícia de até 600 caracteres.");
  const db = read();
  if (db.draft.revision !== expectedRevision) throw new Error("O rascunho mudou. Atualize a página e revise antes de continuar.");
  const before = structuredClone(operation === "save" ? db.draft : db.published);
  if (operation === "save") {
    const normalized = validateSiteContent(content!);
    if (JSON.stringify(normalized) === JSON.stringify(db.draft.content)) throw new Error("Nenhuma alteração informada.");
    db.draft = { revision: db.draft.revision + 1, content: normalized };
  } else {
    if (db.published?.revision === db.draft.revision) throw new Error("Esta revisão já está publicada.");
    db.published = structuredClone(db.draft);
  }
  const event = { id: randomUUID(), operation, actorUserId: userId, occurredAt: new Date().toISOString(), reason: reason.trim(), before, after: structuredClone(db.draft) };
  db.history.push(event); write(db);
  appendAuditEvent({ tenantId: "platform", actorUserId: userId, actorRole: "saas_master", action: operation === "save" ? "platform.site_saved" : "platform.site_published", targetId: event.id });
}
