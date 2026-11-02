import assert from "node:assert/strict";
import test from "node:test";
import { compareWorkPermitDraftRevisions } from "../src/lib/work-permit-draft-comparison.ts";
import type { WorkPermitDraftRevisionsPair } from "../src/lib/work-permit-draft-store.ts";

const left = { mapId: "pte-confined-space" as const, title: "Fictício", status: "draft_demo" as const, revision: 1, occurredAt: "2026-10-29T12:00:00Z", values: { "identity-activity.company": "Empresa fictícia", "legacy.field": "Antes" } };
const pair: WorkPermitDraftRevisionsPair = { draftId: "ficticio", mapId: left.mapId, left, right: { ...left, revision: 2, title: "Novo título", aprId: "apr-ficticia", values: { "identity-activity.company": "Nova\nempresa", "legacy.field": "Depois" } } };
test("compara título, APR, campos mapeados e históricos, preservando quebras e dados", () => {
  const before = JSON.stringify(pair);
  const result = compareWorkPermitDraftRevisions(pair);
  assert.deepEqual(result.changes.map((entry) => entry.key), ["title", "aprId", "value:identity-activity.company", "value:legacy.field"]);
  assert.equal(result.changes[1].before, "");
  assert.equal(result.changes[2].after, "Nova\nempresa");
  assert.equal(result.changes[3].label, "legacy.field");
  assert.equal(JSON.stringify(pair), before);
  assert.deepEqual(compareWorkPermitDraftRevisions({ ...pair, left: pair.right, right: pair.left }), result);
});
test("mostra remoção e distingue salvamento sem alteração de conteúdo", () => {
  const unchanged = { ...left, revision: 3 };
  assert.deepEqual(compareWorkPermitDraftRevisions({ ...pair, right: unchanged }).changes, []);
  const result = compareWorkPermitDraftRevisions({ ...pair, right: { ...unchanged, values: {} } });
  assert.equal(result.changes.length, 2);
  assert.ok(result.changes.every((entry) => entry.after === ""));
});
