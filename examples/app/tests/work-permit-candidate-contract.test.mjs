import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const contract = JSON.parse(readFileSync(new URL("../../../schemas/work-permit-workflow-candidate.json", import.meta.url), "utf8"));

test("contrato PT/PTE permanece candidato e não conectado ao runtime", () => {
  assert.equal(contract.schemaVersion, 20);
  assert.equal(contract.status, "candidate_not_runtime");
});

test("critérios de altura aguardam conteúdo revisado do usuário", () => {
  const height = contract.permit_type_registry.find(({ id }) => id === "work_at_height");
  assert.ok(height);
  assert.equal(height.implementation_status, "demo_only");
  assert.equal(height.technical_criteria_status, "pending_human_review");
  assert.deepEqual(height.technical_criteria_input, {
    status: "awaiting_user_provided_reviewed_content",
    provided_by: "user",
    content_received: false,
    responsible_reviewer_identification_required_now: false,
    criteria_may_be_implemented_before_content_and_review: false,
  });
});

test("aplicabilidade da NORMAM-222 continua reservada para ajuste por cenário", () => {
  const diving = contract.permit_type_registry.find(({ id }) => id === "diving");
  assert.ok(diving);
  assert.deepEqual(diving.normam_222_applicability_by_scenario, {
    status: "reserved_for_later_team_adjustment",
    adjustable_by_project_team: true,
    technical_conclusion_recorded: false,
    blocks_non_operational_prototype: false,
  });
});

test("PTE permanece separada do catálogo de PT", () => {
  const confinedSpace = contract.permit_type_registry.find(({ id }) => id === "confined_space_entry");
  assert.ok(confinedSpace);
  assert.equal(confinedSpace.category, "PTE");
  assert.equal(confinedSpace.separate_from_work_permit_types, true);
});
