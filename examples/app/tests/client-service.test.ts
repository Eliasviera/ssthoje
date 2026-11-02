import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { changeClientCompanyStatus, listClientCompanies, registerClientCompany } from "../src/lib/client-service.ts";
import { listAuditEventsForTenant } from "../src/lib/audit-log.ts";

const input = {
  tenantId: "tenant-fixture",
  legalName: "Empresa fictícia",
  tradeName: "Fictícia",
  contactName: "Contato fictício",
  contactEmail: "",
  contactPhone: "",
  thirdPartyRequirements: ["PGR", "PCMSO", "ASO"] as ("PGR" | "PCMSO" | "ASO")[],
  units: [{ cnpj: "12345678000195", name: "Unidade fictícia", cityState: "Cidade/UF" }],
};

test("serviço de clientes mantém JSON como padrão e audita criação e arquivamento", async () => {
  const originalCwd = process.cwd();
  const originalMode = process.env.SST_CLIENT_STORAGE;
  const root = await mkdtemp(join(tmpdir(), "sst-client-service-"));
  process.chdir(root);
  delete process.env.SST_CLIENT_STORAGE;

  try {
    const actor = { userId: "actor-fixture", role: "consultoria_admin" as const };
    const created = await registerClientCompany(input, actor);
    assert.equal(created.status, "active");
    assert.deepEqual(created.thirdPartyRequirements, ["PGR", "PCMSO", "ASO"]);
    assert.deepEqual(await listClientCompanies(input.tenantId), [created]);

    const archived = await changeClientCompanyStatus(input.tenantId, created.id, "archived", actor);
    assert.equal(archived?.status, "archived");

    const events = listAuditEventsForTenant(input.tenantId);
    assert.deepEqual(events.map((event) => event.action), ["client.status_changed", "client.created"]);
    assert.deepEqual(events.map((event) => event.targetId), [created.id, created.id]);
  } finally {
    process.chdir(originalCwd);
    if (originalMode === undefined) delete process.env.SST_CLIENT_STORAGE;
    else process.env.SST_CLIENT_STORAGE = originalMode;
    await rm(root, { recursive: true, force: true });
  }
});
