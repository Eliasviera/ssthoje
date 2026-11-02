import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateSiteContent } from "../src/lib/site-content.ts";

const sourcePath = join(process.cwd(), "data", "site-content.json");

function fail(message) {
  console.error(`Dry-run interrompido: ${message}`);
  process.exitCode = 1;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isSnapshot(value, nullable = false) {
  if (nullable && value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) return false;
  try {
    const normalized = validateSiteContent(value.content);
    return JSON.stringify(normalized) === JSON.stringify(value.content);
  } catch {
    return false;
  }
}

try {
  const raw = await readFile(sourcePath);
  const text = raw.toString("utf8");
  let state;
  try {
    state = JSON.parse(text);
  } catch {
    throw new Error("o JSON não pôde ser interpretado");
  }

  if (!state || typeof state !== "object" || Array.isArray(state)
    || !isSnapshot(state.draft)
    || !isSnapshot(state.published, true)
    || !Array.isArray(state.history)) {
    throw new Error("o formato do estado não corresponde ao contrato atual do CMS");
  }

  const operations = { save: 0, publish: 0 };
  const eventIds = new Set();
  let firstEventAt = null;
  let lastEventAt = null;
  for (const event of state.history) {
    if (!event || typeof event !== "object"
      || typeof event.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.id)
      || eventIds.has(event.id)
      || !["save", "publish"].includes(event.operation)
      || typeof event.actorUserId !== "string" || !event.actorUserId.trim() || event.actorUserId.length > 200
      || typeof event.reason !== "string" || !event.reason.trim() || event.reason.length > 600
      || !Number.isFinite(Date.parse(event.occurredAt))
      || !isSnapshot(event.after)
      || !isSnapshot(event.before, event.operation === "publish")) {
      throw new Error("um ou mais eventos do histórico não correspondem ao contrato atual");
    }
    eventIds.add(event.id);
    operations[event.operation] += 1;
    const at = new Date(event.occurredAt).toISOString();
    if (firstEventAt === null || at < firstEventAt) firstEventAt = at;
    if (lastEventAt === null || at > lastEventAt) lastEventAt = at;
  }

  const draft = JSON.stringify(validateSiteContent(state.draft.content));
  const published = state.published === null
    ? null
    : JSON.stringify(validateSiteContent(state.published.content));

  console.log("CMS local: dry-run concluído; nenhuma gravação foi realizada.");
  console.log(`Arquivo: data/site-content.json`);
  console.log(`SHA-256 do arquivo: ${digest(raw)}`);
  console.log(`Rascunho: revisão ${state.draft.revision}; SHA-256 normalizado ${digest(draft)}`);
  console.log(published === null
    ? "Publicação: ausente"
    : `Publicação: revisão ${state.published.revision}; SHA-256 normalizado ${digest(published)}`);
  console.log(`Histórico: ${state.history.length} eventos (save=${operations.save}, publish=${operations.publish})`);
  console.log(`Período do histórico: ${firstEventAt ?? "vazio"} até ${lastEventAt ?? "vazio"}`);
  console.log("Texto, justificativas e identificadores foram omitidos da saída.");
} catch (error) {
  fail(error instanceof Error ? error.message : "falha inesperada");
}
