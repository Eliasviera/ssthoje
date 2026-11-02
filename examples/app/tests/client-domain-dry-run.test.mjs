import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

async function withFixture(run) {
  const root = await mkdtemp(join(tmpdir(), "sst-clients-dry-run-"));
  const dataDir = join(root, "data");
  await mkdir(dataDir);
  try {
    await run(dataDir);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeFixture(dataDir, { companies, workers = [], audit = [] }) {
  await writeFile(join(dataDir, "clients.json"), JSON.stringify(companies));
  await writeFile(join(dataDir, "workers.json"), JSON.stringify(workers));
  await writeFile(join(dataDir, "audit-log.jsonl"), audit.map((event) => JSON.stringify(event)).join("\n"));
}

function company({ status, cnpj }) {
  const id = randomUUID();
  const unitId = randomUUID();
  return {
    id,
    tenantId: "tenant-fixture",
    legalName: "Empresa Ficticia",
    tradeName: "Ficticia",
    contactName: "Pessoa Ficticia",
    contactEmail: "fixture@example.invalid",
    contactPhone: "0000000000",
    status,
    units: [{ id: unitId, cnpj, name: "Unidade Ficticia", cityState: "Cidade/UF" }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function worker({ tenantId, companyId, unitId, status = "active" }) {
  return {
    id: randomUUID(),
    tenantId,
    companyId,
    unitId,
    displayName: "Trabalhador Ficticio",
    sex: "Não informado",
    jobTitle: "Função fictícia",
    riskCategories: ["Outro"],
    nr35TrainingStatus: "not_informed",
    heightWorkSupervisionTrainingStatus: "not_informed",
    scaffoldingAssemblyTrainingStatus: "not_informed",
    status,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    history: [{
      id: randomUUID(),
      action: "created",
      actorUserId: "actor-fixture",
      actorRole: "consultoria_admin",
      occurredAt: "2026-01-01T00:00:00.000Z",
      toStatus: "active",
    }],
  };
}

function runDryRun(dataDir) {
  return spawnSync(process.execPath, ["scripts/client-domain-dry-run.mjs", `--data-dir=${dataDir}`], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

test("dry-run preserves and reports an active/archived CNPJ duplicate without printing record data", async () => {
  await withFixture(async (dataDir) => {
    const active = company({ status: "active", cnpj: "12345678000199" });
    const archived = company({ status: "archived", cnpj: "12.345.678/0001-99" });
    const workerRecord = worker({
      tenantId: active.tenantId, companyId: active.id, unitId: active.units[0].id,
    });
    const event = {
      id: randomUUID(), tenantId: active.tenantId, actorUserId: "actor-fixture",
      actorRole: "master", action: "client.created", occurredAt: "2026-01-01T00:00:00.000Z",
    };
    const workerEvent = {
      id: randomUUID(), tenantId: active.tenantId, actorUserId: "actor-fixture",
      actorRole: "consultoria_admin", action: "worker.created", targetId: workerRecord.id,
      occurredAt: "2026-01-01T00:00:00.000Z",
    };
    await writeFixture(dataDir, { companies: [active, archived], workers: [workerRecord], audit: [event, workerEvent] });

    const result = runDryRun(dataDir);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /CNPJs repetidos no tenant: 1 grupos, 1 ocorrências extras; grupos ativo\/arquivado=1/);
    assert.match(result.stdout, /referências empresa\/unidade\/tenant sem correspondência=0/);
    assert.match(result.stdout, /sem targetId=1/);
    assert.match(result.stdout, /Histórico de trabalhadores: 1 eventos/);
    assert.match(result.stdout, /Plano de importação candidato completo: 1\/1 trabalhadores e 1 eventos individuais mapeados/);
    assert.match(result.stdout, /alvos worker\.\* sem correspondência=0/);
    assert.doesNotMatch(result.stdout, /Empresa Ficticia|Pessoa Ficticia|Trabalhador Ficticio|12345678000199|actor-fixture/);
  });
});

test("dry-run rejects unresolved worker references", async () => {
  await withFixture(async (dataDir) => {
    const active = company({ status: "active", cnpj: "12345678000199" });
    await writeFixture(dataDir, {
      companies: [active],
      workers: [worker({ tenantId: active.tenantId, companyId: randomUUID(), unitId: randomUUID() })],
    });

    const result = runDryRun(dataDir);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /referências empresa\/unidade\/tenant sem correspondência=1/);
    assert.match(result.stdout, /Plano de importação candidato incompleto/);
  });
});

test("dry-run rejects malformed worker history without echoing personal data", async () => {
  await withFixture(async (dataDir) => {
    const active = company({ status: "active", cnpj: "12345678000199" });
    const record = worker({
      tenantId: active.tenantId, companyId: active.id, unitId: active.units[0].id,
    });
    record.history[0].actorUserId = "identificador-pessoal-ficticio";
    record.history[0].action = "unexpected";
    await writeFixture(dataDir, { companies: [active], workers: [record] });

    const result = runDryRun(dataDir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /histórico de trabalhadores não corresponde ao contrato/);
    assert.doesNotMatch(result.stderr, /identificador-pessoal-ficticio|Trabalhador Ficticio/);
  });
});
