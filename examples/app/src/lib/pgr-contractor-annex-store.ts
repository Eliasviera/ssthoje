import "server-only";
import { randomUUID } from "node:crypto";
import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { nextContractorAnnex, type AnnexScope, type ContractorAnnex } from "./pgr-contractor-annex";

function file(scope: AnnexScope) {
  if (![scope.tenantId, scope.companyId, scope.unitId].every(value => /^[a-zA-Z0-9_-]{1,140}$/.test(value)) || !/^[a-f0-9]{64}$/.test(scope.sha256)) throw new Error("Escopo do PGR inválido.");
  return join(process.cwd(), "data", "pgr-contractor-annexes", scope.tenantId, scope.companyId, scope.unitId, `${scope.sha256}.jsonl`);
}
export function readContractorAnnexHistory(scope: AnnexScope): ContractorAnnex[] {
  try {
    const records = readFileSync(file(scope), "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as ContractorAnnex);
    if (records.some(record => Object.keys(scope).some(key => record.scope[key as keyof AnnexScope] !== scope[key as keyof AnnexScope]))) throw new Error("Histórico incompatível com este PGR.");
    return records;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
export function saveContractorAnnex(input: Omit<Parameters<typeof nextContractorAnnex>[1], "id" | "recordedAt"> & { id?: string }): ContractorAnnex {
  const target = file(input.scope);
  const id = input.id || randomUUID();
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Identificador de anexo inválido.");
  mkdirSync(dirname(target), { recursive: true });
  let lock;
  try { lock = openSync(`${target}.lock`, "wx"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Outro salvamento está em andamento. Aguarde e atualize a página."); throw error; }
  try {
    const current = readContractorAnnexHistory(input.scope).filter(record => record.id === id).at(-1);
    if (input.id && !current) throw new Error("Anexo indisponível neste PGR.");
    const record = nextContractorAnnex(current, { ...input, id, recordedAt: new Date().toISOString() });
    appendFileSync(target, `${JSON.stringify(record)}\n`, { encoding: "utf8", flag: "a" });
    return record;
  } finally { closeSync(lock); unlinkSync(`${target}.lock`); }
}
export function currentContractorAnnexes(history: ContractorAnnex[]): ContractorAnnex[] {
  const latest = new Map<string, ContractorAnnex>();
  for (const record of history) latest.set(record.id, record);
  return [...latest.values()];
}
