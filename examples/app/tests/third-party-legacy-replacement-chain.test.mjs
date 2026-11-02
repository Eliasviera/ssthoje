import assert from "node:assert/strict";
import test from "node:test";
import { validateLegacyReceiptReplacementChain } from "../src/lib/third-party-legacy-replacement-chain.mjs";

const receipt = (overrides = {}) => ({
  tenantId: "tenant-a",
  sourceStore: "third-party-json",
  invitationId: "invite-a",
  receiptId: "receipt-a",
  sourceKind: "PGR",
  companyId: "company-a",
  unitId: "unit-a",
  contractorCnpj: "11111111111111",
  scopeText: "Trabalho em altura",
  confirmedCaseKey: "case-a",
  receivedAt: "2026-10-01T12:00:00.000Z",
  replacesReceiptId: null,
  ...overrides,
});

test("validates a replacement chain across invitations in the same confirmed series", () => {
  const old = receipt({ receiptId: "old", invitationId: "invite-old" });
  const current = receipt({ receiptId: "current", invitationId: "invite-new", replacesReceiptId: "old", receivedAt: "2026-10-02T12:00:00.000Z" });
  assert.deepEqual(validateLegacyReceiptReplacementChain([old, current], "current"), {
    ok: true,
    chain: ["current", "old"],
  });
});

test("keeps a first receipt as a valid one-item chain", () => {
  assert.deepEqual(validateLegacyReceiptReplacementChain([receipt()], "receipt-a"), {
    ok: true,
    chain: ["receipt-a"],
  });
});

test("blocks missing or ambiguous predecessors", () => {
  const current = receipt({ receiptId: "current", replacesReceiptId: "missing" });
  assert.equal(validateLegacyReceiptReplacementChain([current], "current").reason, "predecessor_missing");
  const duplicate = receipt({ invitationId: "invite-b", receiptId: "old" });
  const replacing = receipt({ receiptId: "current", replacesReceiptId: "old" });
  assert.equal(validateLegacyReceiptReplacementChain([duplicate, receipt({ receiptId: "old" }), replacing], "current").reason, "predecessor_ambiguous");
});

test("blocks category, scope and confirmed-case changes", () => {
  const old = receipt({ receiptId: "old" });
  const current = receipt({ receiptId: "current", replacesReceiptId: "old", receivedAt: "2026-10-02T12:00:00.000Z" });
  assert.equal(validateLegacyReceiptReplacementChain([old, { ...current, sourceKind: "PCMSO" }], "current").reason, "series_mismatch");
  assert.equal(validateLegacyReceiptReplacementChain([old, { ...current, scopeText: "Escopo diferente" }], "current").reason, "series_mismatch");
  assert.equal(validateLegacyReceiptReplacementChain([old, { ...current, confirmedCaseKey: "case-b" }], "current").reason, "case_mismatch");
});

test("blocks forks, cycles and non-monotonic timestamps", () => {
  const old = receipt({ receiptId: "old" });
  const current = receipt({ receiptId: "current", replacesReceiptId: "old", receivedAt: "2026-10-02T12:00:00.000Z" });
  const fork = receipt({ receiptId: "fork", replacesReceiptId: "old", receivedAt: "2026-10-03T12:00:00.000Z" });
  assert.equal(validateLegacyReceiptReplacementChain([old, current, fork], "current").reason, "fork");

  const cycleA = receipt({ receiptId: "a", replacesReceiptId: "b", receivedAt: "2026-10-02T12:00:00.000Z" });
  const cycleB = receipt({ receiptId: "b", replacesReceiptId: "a" });
  assert.equal(validateLegacyReceiptReplacementChain([cycleA, cycleB], "a").reason, "cycle");

  const lateParent = receipt({ receiptId: "old", receivedAt: "2026-10-03T12:00:00.000Z" });
  assert.equal(validateLegacyReceiptReplacementChain([lateParent, current], "current").reason, "time_order");
});

test("blocks a chain until the current receipt has a confirmed case", () => {
  assert.equal(validateLegacyReceiptReplacementChain([receipt({ confirmedCaseKey: null })], "receipt-a").reason, "case_unconfirmed");
});
