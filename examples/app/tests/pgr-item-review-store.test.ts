import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPgrItemReviews, savePgrItemReview } from "../src/lib/pgr-item-review-store.ts";

test("conferências preservam histórico, isolam origem e recusam revisão desatualizada", () => {
  const original = process.cwd(), temporary = mkdtempSync(join(tmpdir(), "pgr-review-"));
  process.chdir(temporary);
  try {
    const hash = "a".repeat(64);
    const input = { itemKey: "role:0", status: "checked" as const, note: "Conferido na origem", actorUserId: "reviewer-fixture" };
    savePgrItemReview("tenant-a", "company-a", hash, input, 0);
    assert.throws(() => savePgrItemReview("tenant-a", "company-a", hash, input, 0), /mudou/);
    savePgrItemReview("tenant-a", "company-a", hash, { ...input, status: "adjustment", note: "Rever descrição" }, 1);
    assert.deepEqual(readPgrItemReviews("tenant-a", "company-a", hash).map(entry => entry.status), ["checked", "adjustment"]);
    assert.equal(readPgrItemReviews("tenant-b", "company-a", hash).length, 0);
    assert.equal(readPgrItemReviews("tenant-a", "company-b", hash).length, 0);
    assert.equal(readPgrItemReviews("tenant-a", "company-a", "b".repeat(64)).length, 0);
    assert.throws(() => savePgrItemReview("tenant-a", "company-a", hash, { ...input, status: "adjustment", note: " " }, 2), /inválida/);
    assert.throws(() => readPgrItemReviews("..", "company-a", hash), /inválida/);
    for (const itemKey of ["exposure:0", "action:0"]) {
      savePgrItemReview("tenant-a", "company-a", hash, { ...input, itemKey, status: "pending", note: "Solicitar complemento documental" }, 0);
      savePgrItemReview("tenant-a", "company-a", hash, { ...input, itemKey, status: "adjustment", note: "Conferir com o responsável" }, 1);
      assert.throws(() => savePgrItemReview("tenant-a", "company-a", hash, { ...input, itemKey }, 1), /mudou/);
      const history = readPgrItemReviews("tenant-a", "company-a", hash).filter(entry => entry.itemKey === itemKey);
      assert.deepEqual(history.map(entry => entry.revision), [1, 2]);
      assert.equal(history[0].note, "Solicitar complemento documental");
      assert.equal(history[1].actorUserId, "reviewer-fixture");
      assert.equal(readPgrItemReviews("tenant-b", "company-a", hash).length, 0);
    }
  } finally { process.chdir(original); rmSync(temporary, { recursive: true, force: true }); }
});
