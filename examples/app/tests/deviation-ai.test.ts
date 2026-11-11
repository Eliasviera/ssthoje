import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { analyzeDeviationPhoto, normalizeDeviationAiDraft } from "../src/lib/deviation-ai.ts";
import { getDeviationAiQuota, releaseDeviationAiAnalysis, reserveDeviationAiAnalysis } from "../src/lib/deviation-ai-quota.ts";
import { decodePhotoDataUrl } from "../src/lib/deviation-photo.ts";
import { createDeviation, DeviationError } from "../src/lib/deviation-store.ts";

const originalDirectory = process.cwd();
const temporaryDirectory = mkdtempSync(join(tmpdir(), "sst-deviation-ai-"));
const savedEnv = { daily: process.env.DEVIATION_AI_DAILY_LIMIT, monthly: process.env.DEVIATION_AI_MONTHLY_LIMIT };
const DAY = "2026-11-11";

before(() => { process.chdir(temporaryDirectory); });
after(() => {
  process.chdir(originalDirectory);
  if (savedEnv.daily === undefined) delete process.env.DEVIATION_AI_DAILY_LIMIT; else process.env.DEVIATION_AI_DAILY_LIMIT = savedEnv.daily;
  if (savedEnv.monthly === undefined) delete process.env.DEVIATION_AI_MONTHLY_LIMIT; else process.env.DEVIATION_AI_MONTHLY_LIMIT = savedEnv.monthly;
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

function sha(label: string) {
  return createHash("sha256").update(label).digest("hex");
}

function fakeJpeg() {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2048, 0x11)]);
}

test("sugestão simulada é determinística, marcada como simulada e sem confiança alta", () => {
  const input = { kind: "deviation" as const, location: "Área de expedição", photoSha256: sha("foto-1") };
  const first = analyzeDeviationPhoto(input);
  const second = analyzeDeviationPhoto(input);
  assert.equal(first.simulated, true);
  assert.equal(first.confidence, "baixa");
  assert.equal(first.description, second.description);
  assert.equal(first.actions.length >= 3, true);
  assert.equal(first.notObserved.length >= 3, true);
  assert.match(first.notObserved.join(" "), /Nenhuma análise de imagem/i);
  assert.match(first.actions[0].when, /Imediato/i);
});

test("rascunho adulterado é recusado na gravação", () => {
  const draft = analyzeDeviationPhoto({ kind: "near_miss", location: "Pátio", photoSha256: sha("foto-2") });
  assert.throws(() => normalizeDeviationAiDraft({ ...draft, simulated: false }), /simulação/i);
  const normalized = normalizeDeviationAiDraft(JSON.parse(JSON.stringify(draft)));
  assert.equal(normalized.description, draft.description);
});

test("limite diário por pessoa bloqueia a décima primeira análise e informa o motivo", () => {
  process.env.DEVIATION_AI_DAILY_LIMIT = "2";
  process.env.DEVIATION_AI_MONTHLY_LIMIT = "100";
  const base = { tenantId: "tenant-a", userId: "user-1", day: DAY };
  assert.equal(reserveDeviationAiAnalysis({ ...base, photoSha256: sha("a1") }).granted, true);
  assert.equal(reserveDeviationAiAnalysis({ ...base, photoSha256: sha("a2") }).granted, true);
  const third = reserveDeviationAiAnalysis({ ...base, photoSha256: sha("a3") });
  assert.equal(third.granted, false);
  assert.match(third.quota.reason ?? "", /por pessoa neste dia/i);
  assert.equal(getDeviationAiQuota(base).usedToday, 2);
});

test("mesma foto em 24h reaproveita o resultado sem consumir cota", () => {
  process.env.DEVIATION_AI_DAILY_LIMIT = "5";
  process.env.DEVIATION_AI_MONTHLY_LIMIT = "100";
  const base = { tenantId: "tenant-b", userId: "user-2", day: DAY };
  const photoSha256 = sha("repetida");
  const first = reserveDeviationAiAnalysis({ ...base, photoSha256 });
  const second = reserveDeviationAiAnalysis({ ...base, photoSha256 });
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(second.granted, true);
  assert.equal(getDeviationAiQuota(base).usedToday, 1);
});

test("teto mensal por tenant bloqueia mesmo com cota diária livre", () => {
  process.env.DEVIATION_AI_DAILY_LIMIT = "10";
  process.env.DEVIATION_AI_MONTHLY_LIMIT = "2";
  assert.equal(reserveDeviationAiAnalysis({ tenantId: "tenant-c", userId: "user-3", day: DAY, photoSha256: sha("c1") }).granted, true);
  assert.equal(reserveDeviationAiAnalysis({ tenantId: "tenant-c", userId: "user-4", day: DAY, photoSha256: sha("c2") }).granted, true);
  const blocked = reserveDeviationAiAnalysis({ tenantId: "tenant-c", userId: "user-5", day: DAY, photoSha256: sha("c3") });
  assert.equal(blocked.granted, false);
  assert.match(blocked.quota.reason ?? "", /neste mês/i);
});

test("falha depois da reserva devolve a cota", () => {
  process.env.DEVIATION_AI_DAILY_LIMIT = "10";
  process.env.DEVIATION_AI_MONTHLY_LIMIT = "100";
  const input = { tenantId: "tenant-d", userId: "user-6", day: DAY, photoSha256: sha("d1") };
  assert.equal(reserveDeviationAiAnalysis(input).granted, true);
  assert.equal(getDeviationAiQuota(input).usedToday, 1);
  releaseDeviationAiAnalysis(input);
  assert.equal(getDeviationAiQuota(input).usedToday, 0);
});

test("desvio grava foto, rascunho revisado e exige foto quando há IA", () => {
  const photo = decodePhotoDataUrl(`data:image/jpeg;base64,${fakeJpeg().toString("base64")}`);
  const draft = analyzeDeviationPhoto({ kind: "deviation", location: "Almoxarifado", photoSha256: photo.sha256 });
  const base = {
    tenantId: "tenant-e", kind: "deviation", companyId: "", unitId: "", occurredOn: "2026-11-11",
    location: "Almoxarifado", description: "Pilha de caixas acima da altura segura.", immediateAction: "Área isolada.",
    reporterName: "Pessoa de teste", actorUserId: "user-7",
  };
  const record = createDeviation({ ...base, photo, ai: draft, aiEdited: true });
  assert.equal(record.photo?.sha256, photo.sha256);
  assert.equal(record.review?.editedBeforeSave, true);
  assert.equal(record.history.some((entry) => entry.action === "ai_reviewed"), true);
  assert.equal(existsSync(join(process.cwd(), "data", "deviation-photos", record.photo?.fileName ?? "")), true);

  assert.throws(() => createDeviation({ ...base, ai: draft }), (error: unknown) => error instanceof DeviationError && /foto/i.test(error.message));
});
