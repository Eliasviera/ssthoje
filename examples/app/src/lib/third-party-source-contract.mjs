import { THIRD_PARTY_DOCUMENT_KINDS } from "./third-party-policy.ts";

const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const string = value => typeof value === "string";
const nonempty = value => string(value) && value.trim().length > 0;
const bounded = limit => value => nonempty(value) && value.length <= limit;
const integer = value => Number.isSafeInteger(value) && value > 0;
const digest = value => string(value) && /^[a-f0-9]{64}$/.test(value);
const cnpj = value => string(value) && /^\d{14}$/.test(value); // Formato, sem alegação de autenticidade.
const day = value => string(value) && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const timestamp = value => string(value) && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) && day(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
const optional = validate => value => value === undefined || validate(value);
const enumeration = values => value => values.includes(value);
const array = validate => value => Array.isArray(value) && value.every(validate);
const kind = enumeration(THIRD_PARTY_DOCUMENT_KINDS);
export const sourceContractValues = Object.freeze({ object, string, nonempty, integer, cnpj, day, timestamp, optional, enumeration, array });

// Contrato apenas de third-party.json. Desconhecidos bloqueiam, nunca são descartados.
export function validateThirdPartySource(source) {
  const counts = new Map();
  const add = code => counts.set(code, (counts.get(code) ?? 0) + 1);
  const shape = (value, fields, label) => {
    if (!object(value)) { add(`CONTRACT_${label}_OBJECT`); return false; }
    for (const name of Object.keys(value)) if (!Object.hasOwn(fields, name)) add(`CONTRACT_${label}_UNKNOWN_FIELD`);
    for (const [name, validate] of Object.entries(fields)) if (!validate(value[name])) add(`CONTRACT_${label}_FIELD`);
    return true;
  };
  const period = value => {
    if (value === undefined) return true;
    if (!object(value)) return false;
    shape(value, { startedOn: day, dueOn: day, calendarDays: value => value === 3, timeZone: value => value === "America/Sao_Paulo" }, "PERIOD");
    return true; // Relação início/vencimento verificada pelo analisador de histórico.
  };
  const event = value => shape(value, {
    id: nonempty, type: enumeration(["opened", "assigned", "commented", "resent", "reopened", "resolved"]), occurredAt: timestamp,
    actorUserId: nonempty, receiptId: nonempty, notes: bounded(1200), evidence: value => string(value) && value.length <= 1200,
    requestedChange: optional(bounded(1200)), assigneeUserId: optional(nonempty), correctionPeriod: period,
  }, "EVENT");
  const issue = value => shape(value, {
    id: nonempty, kind, originalReceiptId: nonempty, currentReceiptId: nonempty, reason: bounded(600), requestedChange: bounded(1200),
    assigneeUserId: nonempty, status: enumeration(["open", "awaiting_review", "resolved"]), revision: integer, correctionPeriod: period, events: array(event),
  }, "ISSUE");
  const receipt = value => shape(value, {
    id: nonempty, kind, fileName: bounded(140), storageName: nonempty, size: value => integer(value) && value <= 7 * 1024 * 1024,
    digest, receivedAt: timestamp, validUntil: optional(day), replacesReceiptId: optional(nonempty), issueId: optional(nonempty),
  }, "RECEIPT");
  const invite = value => shape(value, {
    id: nonempty, tenantId: nonempty, companyId: nonempty, unitId: nonempty, companyName: nonempty, unitName: nonempty,
    relatedCnpj: cnpj, contractorName: bounded(140), contractorCnpj: cnpj, scope: optional(bounded(240)),
    requested: value => array(kind)(value) && value.length > 0 && new Set(value).size === value.length,
    medicalAsoRequired: optional(value => typeof value === "boolean"), tokenHash: digest, createdAt: timestamp, expiresAt: timestamp,
    revokedAt: optional(timestamp), receipts: array(receipt), issues: optional(array(issue)),
  }, "INVITATION");
  const approval = value => shape(value, { id: nonempty, tenantId: nonempty, invitationId: nonempty, fingerprint: digest, approvedBy: nonempty, approvedAt: timestamp, notes: bounded(1200) }, "APPROVAL");
  const schedule = value => shape(value, { id: nonempty, tenantId: nonempty, invitationId: nonempty, approvalId: nonempty, scheduledOn: day, createdBy: nonempty, createdAt: timestamp }, "SCHEDULE");
  shape(source, { invitations: array(invite), integrationApprovals: optional(array(approval)), integrationSchedules: optional(array(schedule)) }, "SOURCE");
  const issues = [...counts].map(([code, count]) => ({ severity: "blocker", code, count })).sort((a, b) => a.code.localeCompare(b.code));
  return { contractVersion: 1, issues, blockers: issues.reduce((total, issue) => total + issue.count, 0) };
}
