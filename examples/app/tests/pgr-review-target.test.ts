import test from "node:test";
import assert from "node:assert/strict";
import { pgrReviewTargetExists, parsePgrReviewTarget } from "../src/lib/pgr-review-target.ts";

test("conferência aceita somente itens existentes em cada coleção da origem", () => {
  const profile = { roles: [{}], risks: [{}, {}], exposures: [{}, {}, {}], actions: [] };
  for (const key of ["role:0", "risk:1", "exposure:2"]) assert.equal(pgrReviewTargetExists(key, profile), true);
  for (const key of ["role:1", "risk:2", "exposure:3", "action:0"]) assert.equal(pgrReviewTargetExists(key, profile), false);
  assert.equal(pgrReviewTargetExists("action:0", { ...profile, actions: [{}] }), true);
  for (const key of ["exposure:-1", "action:01", "risk:1.5", "exposure:1e0", "action:9007199254740992", "other:0", "role:0\n"]) {
    assert.equal(parsePgrReviewTarget(key), null, key);
  }
});
