import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TenantRole } from "./tenant-access";
import type { DocumentKind } from "./document-categories";

export type ComplianceRule = {
  id: string;
  tenantId: string;
  title: string;
  documentKind: DocumentKind;
  criteria: string;
  sourceTitle: string;
  sourceVersion: string;
  jurisdiction: string;
  validFrom: string;
  validUntil: string;
  reviewer: string;
  version: number;
  status: "active" | "superseded";
  previousRuleId: string;
  createdAt: string;
  createdBy: string;
};
export type EvaluationResult = "atende" | "pendente" | "inconclusivo" | "nao_aplicavel";
export type ComplianceEvaluation = {
  id: string;
  tenantId: string;
  ruleId: string;
  ruleTitle: string;
  ruleVersion: number;
  sourceTitle: string;
  sourceVersion: string;
  documentId: string;
  documentTitle: string;
  documentKind: DocumentKind;
  documentVersion: number;
  documentSource?: "consultoria" | "contratada";
  documentSourceLabel?: string;
  companyId?: string;
  unitId?: string;
  companyName?: string;
  unitName?: string;
  result: EvaluationResult;
  notes: string;
  evidence: string;
  evidenceDocumentId: string;
  responsible: string;
  nextStep: string;
  evaluatedAt: string;
  evaluatedBy: string;
  evaluatorRole: TenantRole;
};
export type NewComplianceRule = Omit<ComplianceRule, "id" | "version" | "status" | "createdAt" | "previousRuleId"> & {
  previousRuleId: string;
};
export type NewComplianceEvaluation = Omit<ComplianceEvaluation, "id" | "evaluatedAt" | "evaluatedBy" | "evaluatorRole" | "ruleTitle" | "ruleVersion" | "sourceTitle" | "sourceVersion" | "documentTitle" | "documentKind" | "documentVersion" | "documentSource" | "documentSourceLabel" | "companyId" | "unitId" | "companyName" | "unitName">;

type ComplianceData = { rules: ComplianceRule[]; evaluations: ComplianceEvaluation[] };
const emptyData: ComplianceData = { rules: [], evaluations: [] };

function getStorePath() {
  return join(process.cwd(), "data", "compliance.json");
}

function readData(): ComplianceData {
  try {
    const value: unknown = JSON.parse(readFileSync(getStorePath(), "utf8"));
    if (!value || typeof value !== "object" || !Array.isArray((value as ComplianceData).rules) || !Array.isArray((value as ComplianceData).evaluations)) {
      throw new Error("O arquivo local de critérios tem formato inválido.");
    }
    return value as ComplianceData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...emptyData };
    throw error;
  }
}

function writeData(data: ComplianceData) {
  const path = getStorePath();
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(temporaryPath, path);
}

export function listComplianceRulesForTenant(tenantId: string): ComplianceRule[] {
  return readData().rules.filter((rule) => rule.tenantId === tenantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((rule) => ({ ...rule }));
}

export function listComplianceEvaluationsForTenant(tenantId: string): ComplianceEvaluation[] {
  return readData().evaluations.filter((evaluation) => evaluation.tenantId === tenantId).sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt)).map((evaluation) => ({ ...evaluation }));
}

export function createComplianceRule(input: NewComplianceRule): ComplianceRule {
  const data = readData();
  const previous = input.previousRuleId ? data.rules.find((rule) => rule.id === input.previousRuleId && rule.tenantId === input.tenantId && rule.status === "active") : undefined;
  if (input.previousRuleId && !previous) throw new Error("A regra anterior não está disponível nesta consultoria.");
  if (previous && (previous.title !== input.title || previous.documentKind !== input.documentKind)) {
    throw new Error("Uma nova versão precisa manter o nome e o tipo de documento do critério anterior.");
  }
  if (previous) previous.status = "superseded";
  const rule: ComplianceRule = {
    ...input,
    id: randomUUID(),
    version: previous ? previous.version + 1 : 1,
    status: "active",
    previousRuleId: previous?.id ?? "",
    createdAt: new Date().toISOString(),
  };
  writeData({ ...data, rules: [...data.rules, rule] });
  return { ...rule };
}

export function recordComplianceEvaluation(
  input: NewComplianceEvaluation,
  snapshot: { rule: ComplianceRule; document: { title: string; kind: DocumentKind; version: number; source: "consultoria" | "contratada"; sourceLabel: string; companyId: string; unitId: string; companyName: string; unitName: string } },
  actor: { userId: string; role: TenantRole },
): ComplianceEvaluation {
  const evaluation: ComplianceEvaluation = {
    ...input,
    id: randomUUID(),
    ruleTitle: snapshot.rule.title,
    ruleVersion: snapshot.rule.version,
    sourceTitle: snapshot.rule.sourceTitle,
    sourceVersion: snapshot.rule.sourceVersion,
    documentTitle: snapshot.document.title,
    documentKind: snapshot.document.kind,
    documentVersion: snapshot.document.version,
    documentSource: snapshot.document.source,
    documentSourceLabel: snapshot.document.sourceLabel,
    companyId: snapshot.document.companyId,
    unitId: snapshot.document.unitId,
    companyName: snapshot.document.companyName,
    unitName: snapshot.document.unitName,
    evaluatedAt: new Date().toISOString(),
    evaluatedBy: actor.userId,
    evaluatorRole: actor.role,
  };
  const data = readData();
  writeData({ ...data, evaluations: [...data.evaluations, evaluation] });
  return { ...evaluation };
}
