import assert from "node:assert/strict";
import test from "node:test";
import { resolveWorkPermitAuditTargets } from "../src/lib/work-permit-audit-targets.ts";

const event = { id: "event-a", actorRole: "consultoria_admin", action: "safety.work_permit_draft_saved", occurredAt: "2026-10-28T12:00:00Z", tenantId: "tenant-a", targetId: "draft-a" };
const draft = { id: "draft-a", tenantId: "tenant-a", title: "Rascunho fictício", mapId: "pte-confined-space" };
test("resolve alvo do mesmo tenant com link para versão atual", () => {
  const [result] = resolveWorkPermitAuditTargets("tenant-a", [event], [draft]);
  assert.equal(result.workPermitDraft?.title, draft.title);
  assert.equal(result.workPermitDraft?.href, "/permissoes-trabalho?draft=draft-a#permit-form-pte-confined-space");
  assert.equal("targetId" in result, false);
});
test("alvo ausente, outro tenant, evento estrangeiro ou modalidade desconhecida não expõem link", () => {
  for (const [entry, targets] of [
    [event, []], [event, [{ ...draft, tenantId: "tenant-b" }]],
    [{ ...event, tenantId: "tenant-b" }, [draft]],
    [{ ...event, action: "other.action" }, [draft]],
    [event, [{ ...draft, mapId: "unknown" }]],
  ] as const) {
    const [result] = resolveWorkPermitAuditTargets("tenant-a", [entry], [...targets]);
    assert.equal(result.workPermitDraft, undefined);
    assert.equal("targetId" in result, false);
  }
});
test("link codifica ID e usa formulário correspondente sem alterar os dados", () => {
  const targets = [{ ...draft, id: "a&b", mapId: "hot-work-composite" }];
  const entries = [{ ...event, targetId: "a&b" }];
  const before = JSON.stringify({ entries, targets });
  const [result] = resolveWorkPermitAuditTargets("tenant-a", entries, targets);
  assert.equal(result.workPermitDraft?.href, "/permissoes-trabalho?draft=a%26b#permit-form-hot-work-composite");
  assert.equal(JSON.stringify({ entries, targets }), before);
});
