import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TenantRole } from "./tenant-access";

export type AuditEvent = {
  // Revisões internas não constituem aprovação normativa.
  id: string;
  tenantId: string;
  actorUserId: string;
  actorRole: TenantRole;
  action: "thirdparty.integration_approved" | "thirdparty.integration_scheduled" | "compliance.reference_reviewed" | "platform.governance_read" | "platform.governance_changed" | "platform.operations_exported" | "platform.jobs_read" | "platform.job_changed" | "platform.integration_read" | "platform.integration_run" | "platform.site_read" | "platform.site_saved" | "platform.site_published" | "platform.billing_read" | "platform.billing_changed" | "platform.access_denied" | "platform.overview_read" | "platform.settings_changed" | "platform.support_diagnosed" | "operations.deadline_set" | "operations.preferences_set" | "operations.notice_created" | "operations.notice_read" | "dds.created" | "dds.signed" | "dds.responsible_signed" | "dds.closed" | "checklist.template_created" | "checklist.template_archived" | "checklist.completed" | "epi.created" | "epi.read" | "epi.link_renewed" | "epi.code_issued" | "epi.code_failed" | "epi.confirmed" | "epi.canceled" | "epi.receipt_read" | "epi.offline_synced" | "epi.offline_reviewed" | "epi.stock_ca_reviewed" | "thirdparty.issue_opened" | "thirdparty.issue_updated" | "thirdparty.issue_reviewed" | "thirdparty.created" | "thirdparty.revoked" | "thirdparty.read" | "thirdparty.downloaded" | "thirdparty.portal_opened" | "thirdparty.received" | "aso.read" | "aso.status_read" | "aso.workers_read" | "aso.saved" | "aso.submitted" | "aso.reviewed" | "pcmso.read" | "pcmso.status_read" | "pcmso.assigned" | "pcmso.saved" | "pcmso.submitted" | "pcmso.reviewed" | "esocial.mapping_created" | "esocial.mapping_saved" | "esocial.mapping_reviewed" | "safety.checklist_draft_created" | "safety.checklist_activated" | "safety.apr_created" | "safety.apr_saved" | "safety.apr_submitted" | "safety.risk_analysis_created" | "safety.risk_analysis_saved" | "safety.risk_analysis_issued" | "safety.work_permit_draft_saved" | "auth.login_succeeded" | "auth.logout" | "client.created" | "client.updated" | "client.status_changed" | "worker.created" | "worker.updated" | "worker.status_changed" | "document.uploaded" | "document.replaced" | "document.archived" | "compliance.rule_created" | "compliance.evaluated" | "pgr.created" | "pgr.updated" | "pgr.submitted" | "pgr.approved";
  targetId?: string;
  occurredAt: string;
};

type AuditEventInput = Omit<AuditEvent, "id" | "occurredAt">;

// JSON Lines local: um evento por linha, no computador que executa o servidor.
function getAuditLogPath() {
  return join(process.cwd(), "data", "audit-log.jsonl");
}

function readEvents(): AuditEvent[] {
  const path = getAuditLogPath();
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  return contents.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as AuditEvent);
}

// API append-only: novos eventos são acrescentados ao arquivo local; os eventos existentes não são alterados.
export function appendAuditEvent(input: AuditEventInput): AuditEvent {
  if (!input.tenantId || !input.actorUserId || !input.actorRole || !input.action) {
    throw new Error("Evento de auditoria incompleto.");
  }
  const event: AuditEvent = { ...input, id: randomUUID(), occurredAt: new Date().toISOString() };
  const path = getAuditLogPath();
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(event)}\n`, { encoding: "utf8", flag: "a" });
  return { ...event };
}

export function listAuditEventsForTenant(tenantId: string): AuditEvent[] {
  return readEvents()
    .filter((event) => event.tenantId === tenantId)
    .slice(-100)
    .reverse()
    .map((event) => ({ ...event }));
}
