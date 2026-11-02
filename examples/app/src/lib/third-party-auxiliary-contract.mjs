import { CLIENT_THIRD_PARTY_REQUIREMENTS } from "./third-party-policy.ts";
import { DOCUMENT_KINDS } from "./document-categories.ts";
import { sourceContractValues as v } from "./third-party-source-contract.mjs";

const roles = ["consultoria_admin", "sst_tst", "cliente", "terceiro", "profissional_habilitado", "medico_coordenador", "saas_master"];
const key = (tenant, id) => JSON.stringify([tenant, id]);

// Valida somente os recortes consumidos por Terceiros; não importa outros domínios.
export function validateThirdPartyAuxiliarySources({ source, clients, compliance, documents, audit }) {
  const problems = new Map();
  const add = code => problems.set(code, (problems.get(code) ?? 0) + 1);
  const shape = (row, fields, code) => {
    if (!v.object(row)) { add(code); return false; }
    for (const [field, validate] of Object.entries(fields)) if (!validate(row[field])) add(code);
    return true;
  };
  const list = value => { if (!Array.isArray(value)) { add("AUX_INVALID_COLLECTION"); return []; } return value; };
  const invitations = Array.isArray(source?.invitations) ? source.invitations.filter(v.object) : [];
  const tenants = new Set(invitations.map(invite => invite.tenantId));
  const companyKeys = new Set(invitations.map(invite => key(invite.tenantId, invite.companyId)));
  const evidenceKeys = new Set();
  const rules = list(compliance?.rules), evaluations = list(compliance?.evaluations);
  const selectedEvaluations = evaluations.filter(row => v.object(row) && row.documentSource === "contratada");
  for (const row of selectedEvaluations) {
    shape(row, { id: v.nonempty, tenantId: v.nonempty, ruleId: v.nonempty, ruleVersion: v.integer, ruleTitle: v.nonempty,
      sourceTitle: v.nonempty, sourceVersion: v.nonempty, documentId: v.nonempty, documentTitle: v.nonempty, documentKind: v.enumeration(DOCUMENT_KINDS), documentVersion: v.integer,
      companyId: v.nonempty, unitId: v.nonempty, result: v.enumeration(["atende", "pendente", "inconclusivo", "nao_aplicavel"]), notes: v.nonempty, evidence: v.string,
      evidenceDocumentId: v.string, responsible: v.string, nextStep: v.string, evaluatedAt: v.timestamp, evaluatedBy: v.nonempty, evaluatorRole: v.enumeration(roles),
    }, "AUX_INVALID_CONTRACTOR_EVALUATION");
    if (v.nonempty(row.evidenceDocumentId)) evidenceKeys.add(key(row.tenantId, row.evidenceDocumentId));
  }
  for (const company of list(clients)) {
    if (!v.object(company) || !v.nonempty(company.id) || !v.nonempty(company.tenantId)) { add("AUX_INVALID_COMPANY_IDENTITY"); continue; }
    if (!companyKeys.has(key(company.tenantId, company.id))) continue;
    shape(company, { legalName: v.nonempty, tradeName: v.string, status: v.enumeration(["active", "archived"]),
      thirdPartyRequirements: v.optional(value => v.array(v.enumeration(CLIENT_THIRD_PARTY_REQUIREMENTS))(value) && new Set(value).size === value.length),
    }, "AUX_INVALID_COMPANY");
    const unitIds = new Set();
    for (const unit of list(company.units)) {
      if (!shape(unit, { id: v.nonempty, cnpj: v.cnpj, name: v.nonempty }, "AUX_INVALID_UNIT")) continue;
      if (unitIds.has(unit.id)) add("AUX_DUPLICATE_UNIT");
      unitIds.add(unit.id);
    }
  }
  for (const rule of rules) {
    if (!v.object(rule) || !v.nonempty(rule.id) || !v.nonempty(rule.tenantId)) { add("AUX_INVALID_RULE_IDENTITY"); continue; }
    if (!tenants.has(rule.tenantId) && !selectedEvaluations.some(row => row.tenantId === rule.tenantId && row.ruleId === rule.id)) continue;
    shape(rule, { title: v.nonempty, documentKind: v.enumeration(DOCUMENT_KINDS), criteria: v.nonempty, sourceTitle: v.nonempty,
      sourceVersion: v.nonempty, jurisdiction: v.nonempty, validFrom: v.day, validUntil: value => value === "" || v.day(value), reviewer: v.nonempty,
      version: v.integer, status: v.enumeration(["active", "superseded"]), previousRuleId: v.string, createdAt: v.timestamp, createdBy: v.nonempty,
    }, "AUX_INVALID_RULE");
    if (v.day(rule.validFrom) && v.day(rule.validUntil) && rule.validUntil < rule.validFrom) add("AUX_INVALID_RULE_PERIOD");
    if (v.nonempty(rule.previousRuleId)) {
      const previous = rules.find(row => v.object(row) && row.tenantId === rule.tenantId && row.id === rule.previousRuleId);
      if (!previous || previous.documentKind !== rule.documentKind || previous.version >= rule.version) add("AUX_INVALID_PREVIOUS_RULE");
    }
  }
  for (const document of list(documents)) {
    if (!v.object(document) || !v.nonempty(document.id) || !v.nonempty(document.tenantId)) { add("AUX_INVALID_DOCUMENT_IDENTITY"); continue; }
    if (!evidenceKeys.has(key(document.tenantId, document.id))) continue;
    shape(document, { groupId: v.nonempty, companyId: v.nonempty, unitId: v.nonempty, title: v.nonempty, kind: v.enumeration(DOCUMENT_KINDS),
      storageName: v.nonempty, size: v.integer, version: v.integer, status: v.enumeration(["received", "superseded", "archived"]),
      validUntil: value => value === "" || v.day(value), uploadedAt: v.timestamp, uploadedBy: v.nonempty,
    }, "AUX_INVALID_EVIDENCE_DOCUMENT");
  }
  for (const event of list(audit)) {
    if (!v.object(event) || !v.nonempty(event.action)) { add("AUX_INVALID_AUDIT_ENVELOPE"); continue; }
    if (!event.action.startsWith("thirdparty.")) continue;
    shape(event, { id: v.nonempty, tenantId: v.nonempty, actorUserId: v.nonempty, actorRole: v.enumeration(roles), occurredAt: v.timestamp, targetId: v.optional(v.nonempty) }, "AUX_INVALID_THIRDPARTY_AUDIT");
    if (Object.keys(event).some(field => !["id", "tenantId", "actorUserId", "actorRole", "occurredAt", "targetId", "action"].includes(field))) add("AUX_UNKNOWN_THIRDPARTY_AUDIT_FIELD");
  }
  const issues = [...problems].map(([code, count]) => ({ severity: "blocker", code, count })).sort((a, b) => a.code.localeCompare(b.code));
  return { auxiliaryContractVersion: 1, issues, blockers: issues.reduce((total, issue) => total + issue.count, 0) };
}
