import assert from "node:assert/strict";
import test from "node:test";
import { analyzePcmsoMigration } from "../src/lib/pcmso-migration.ts";

const scopeKey = "tenant-a\u0000company-a\u0000unit-a";
function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "pcmso-a", tenantId: "tenant-a", companyId: "company-a", unitId: "unit-a",
    companyName: "Fictícia", unitName: "Unidade", coordinatorId: "doctor-a", status: "reviewed", version: 1,
    content: "Documento fictício", createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-02T10:00:00.000Z",
    revisions: [{ version: 1, content: "Documento fictício", savedAt: "2026-10-01T10:05:00.000Z", actorUserId: "doctor-a" }],
    history: [
      { action: "assigned", actorUserId: "admin-a", occurredAt: "2026-10-01T10:00:00.000Z" },
      { action: "save", actorUserId: "doctor-a", occurredAt: "2026-10-01T10:05:00.000Z" },
      { action: "submit", actorUserId: "doctor-a", occurredAt: "2026-10-01T10:06:00.000Z" },
      { action: "review", actorUserId: "doctor-a", occurredAt: "2026-10-01T10:07:00.000Z" },
    ],
    ...overrides,
  };
}

test("PCMSO migration dry-run accepts a complete record in a known tenant scope", () => {
  const result = analyzePcmsoMigration({ records: [record()] }, new Set([scopeKey]));
  assert.deepEqual({ total: result.total, ready: result.ready, blocked: result.blocked }, { total: 1, ready: 1, blocked: 0 });
});

test("PCMSO migration dry-run blocks missing scopes and repeated IDs or units", () => {
  const result = analyzePcmsoMigration({ records: [record(), record()] }, new Set());
  assert.deepEqual(result.issues.map(issue => issue.code), ["scope_missing", "scope_missing"]);
  const duplicate = analyzePcmsoMigration({ records: [record(), record({ id: "pcmso-b" })] }, new Set([scopeKey]));
  assert.deepEqual(duplicate.issues.map(issue => issue.code), ["duplicate_scope"]);
});

test("PCMSO migration dry-run blocks incomplete or divergent revision history", () => {
  const result = analyzePcmsoMigration({ records: [record({ revisions: [] })] }, new Set([scopeKey]));
  assert.equal(result.blocked, 1);
  assert.equal(result.issues[0].code, "history_invalid");
});

test("PCMSO migration dry-run rejects malformed top-level source", () => {
  const result = analyzePcmsoMigration([], new Set());
  assert.equal(result.blocked, 1);
  assert.equal(result.issues[0].code, "invalid_source");
});
