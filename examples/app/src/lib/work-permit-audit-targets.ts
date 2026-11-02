type AuditEntry = { id: string; actorRole: string; action: string; occurredAt: string; tenantId?: string; targetId?: string };
type DraftTarget = { id: string; tenantId: string; title: string; mapId: string };
export type WorkPermitAuditEntry = Pick<AuditEntry, "id" | "actorRole" | "action" | "occurredAt"> & {
  workPermitDraft?: { title: string; href: string };
};

// Resolve on the server using only records loaded for the authenticated tenant.
export function resolveWorkPermitAuditTargets(tenantId: string, events: AuditEntry[], drafts: DraftTarget[]): WorkPermitAuditEntry[] {
  const targets = new Map(drafts.filter((draft) => draft.tenantId === tenantId
    && ["pte-confined-space", "hot-work-composite"].includes(draft.mapId)).map((draft) => [draft.id, draft]));
  return events.map((event) => {
    const base = { id: event.id, actorRole: event.actorRole, action: event.action, occurredAt: event.occurredAt };
    const draft = event.action === "safety.work_permit_draft_saved" && event.tenantId === tenantId && event.targetId
      ? targets.get(event.targetId) : undefined;
    return draft ? { ...base, workPermitDraft: { title: draft.title, href: `/permissoes-trabalho?draft=${encodeURIComponent(draft.id)}#permit-form-${draft.mapId}` } } : base;
  });
}
