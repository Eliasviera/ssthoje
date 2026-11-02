import { THIRD_PARTY_DOCUMENT_KINDS } from "./third-party-policy.ts";

const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const text = value => typeof value === "string" && value.trim().length > 0;
const timestamp = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const day = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const key = (tenant, id) => JSON.stringify([tenant, id]);

// Não retorna identificadores nem conteúdo da origem e não altera os objetos recebidos.
export function analyzeThirdPartyMigration(source, clients, audit, compliance, documents) {
  const problems = new Map();
  const add = (code, severity = "blocker") => {
    const label = `${severity}:${code}`;
    problems.set(label, (problems.get(label) ?? 0) + 1);
  };
  const list = (value, optional = false) => {
    if (optional && value === undefined) return [];
    if (!Array.isArray(value)) { add("INVALID_COLLECTION"); return []; }
    return value;
  };
  const counts = { invitations: 0, receipts: 0, issues: 0, issueEvents: 0, approvals: 0, schedules: 0, auditEvents: 0, contractorEvaluations: 0, internalEvidenceReferences: 0 };
  if (!object(source)) add("INVALID_SOURCE");
  const invitations = list(source?.invitations);
  const approvals = list(source?.integrationApprovals, true);
  const schedules = list(source?.integrationSchedules, true);
  const companies = list(clients);
  const events = list(audit);
  const index = (rows, code) => {
    const result = new Map();
    for (const row of rows) {
      if (!object(row) || !text(row.id) || !text(row.tenantId)) { add("INVALID_IDENTITY"); continue; }
      const id = key(row.tenantId, row.id);
      if (result.has(id)) add(code);
      else result.set(id, row);
    }
    return result;
  };
  const invitationIndex = index(invitations, "DUPLICATE_INVITATION");
  const companyIndex = index(companies, "DUPLICATE_COMPANY");
  const approvalIndex = index(approvals, "DUPLICATE_APPROVAL");
  const scheduleIndex = index(schedules, "DUPLICATE_SCHEDULE");
  const rules = list(compliance?.rules);
  const evaluations = list(compliance?.evaluations);
  const ruleIndex = index(rules, "DUPLICATE_COMPLIANCE_RULE");
  const documentIndex = index(list(documents), "DUPLICATE_INTERNAL_DOCUMENT");
  const receipts = new Map(), issueIds = new Set(), eventIds = new Set(), issueRecords = new Map();
  const period = value => {
    if (value === undefined) return;
    if (!object(value) || !day(value.startedOn) || !day(value.dueOn) || value.calendarDays !== 3 || value.timeZone !== "America/Sao_Paulo") { add("INVALID_CORRECTION_PERIOD"); return; }
    if (Date.parse(`${value.dueOn}T12:00:00Z`) - Date.parse(`${value.startedOn}T12:00:00Z`) !== 3 * 86400000) add("INVALID_CORRECTION_PERIOD");
  };
  for (const invite of invitations) {
    counts.invitations++;
    if (!object(invite)) continue;
    const company = companyIndex.get(key(invite.tenantId, invite.companyId));
    if (!company || !Array.isArray(company.units) || !company.units.some(unit => object(unit) && unit.id === invite.unitId)) add("INVALID_COMPANY_UNIT");
    if (invite.scope === undefined) add("LEGACY_SCOPE_ABSENT", "warning");
    else if (!text(invite.scope)) add("INVALID_SCOPE");
    if (!timestamp(invite.createdAt) || !timestamp(invite.expiresAt) || Date.parse(invite.expiresAt) <= Date.parse(invite.createdAt) || (invite.revokedAt !== undefined && (!timestamp(invite.revokedAt) || Date.parse(invite.revokedAt) < Date.parse(invite.createdAt)))) add("INVALID_INVITATION_DATES");
    if (typeof invite.tokenHash !== "string" || !/^[a-f0-9]{64}$/.test(invite.tokenHash)) add("INVALID_TOKEN_HASH");
    const requested = list(invite.requested);
    if (!requested.length || requested.some(kind => !THIRD_PARTY_DOCUMENT_KINDS.includes(kind)) || new Set(requested).size !== requested.length) add("INVALID_REQUESTED_KINDS");
    for (const receipt of list(invite.receipts)) {
      counts.receipts++;
      if (!object(receipt) || !text(receipt.id)) { add("INVALID_RECEIPT"); continue; }
      const id = key(invite.tenantId, receipt.id);
      if (receipts.has(id)) add("DUPLICATE_RECEIPT");
      else receipts.set(id, { receipt, invite });
      if (!requested.includes(receipt.kind) || !timestamp(receipt.receivedAt) || Date.parse(receipt.receivedAt) < Date.parse(invite.createdAt) || !Number.isSafeInteger(receipt.size) || receipt.size <= 0 || typeof receipt.digest !== "string" || !/^[a-f0-9]{64}$/.test(receipt.digest) || !text(receipt.storageName)) add("INVALID_RECEIPT");
      if (receipt.validUntil === undefined) add("LEGACY_VALIDITY_ABSENT", "warning");
      else if (!day(receipt.validUntil)) add("INVALID_VALIDITY");
    }
  }
  const sameScope = (a, b) => a.tenantId === b.tenantId && a.companyId === b.companyId && a.unitId === b.unitId && a.contractorCnpj === b.contractorCnpj && (text(a.scope) && text(b.scope) ? a.scope.trim().toLocaleLowerCase("pt-BR") === b.scope.trim().toLocaleLowerCase("pt-BR") : a.id === b.id);
  const receiptFor = (invite, id, kind) => {
    const entry = receipts.get(key(invite.tenantId, id));
    return entry && sameScope(invite, entry.invite) && entry.receipt.kind === kind ? entry.receipt : null;
  };
  for (const { receipt, invite } of receipts.values()) {
    if (receipt.replacesReceiptId !== undefined) {
      const previous = receiptFor(invite, receipt.replacesReceiptId, receipt.kind);
      if (!previous || previous.id === receipt.id || Date.parse(previous.receivedAt) > Date.parse(receipt.receivedAt)) add("INVALID_REPLACEMENT");
      const seen = new Set([receipt.id]);
      let current = previous;
      while (current) {
        if (seen.has(current.id)) { add("REPLACEMENT_CYCLE"); break; }
        seen.add(current.id);
        current = current.replacesReceiptId ? receiptFor(invite, current.replacesReceiptId, receipt.kind) : null;
      }
    }
  }
  for (const invite of invitations.filter(object)) {
    for (const issue of list(invite.issues, true)) {
      counts.issues++;
      if (!object(issue) || !text(issue.id)) { add("INVALID_ISSUE"); continue; }
      const id = key(invite.tenantId, issue.id);
      if (issueIds.has(id)) add("DUPLICATE_ISSUE");
      issueIds.add(id);
      issueRecords.set(id, { invite, issue, resent: new Set() });
      if (!receiptFor(invite, issue.originalReceiptId, issue.kind) || !receiptFor(invite, issue.currentReceiptId, issue.kind)) add("INVALID_ISSUE_RECEIPT");
      if (!["open", "awaiting_review", "resolved"].includes(issue.status)) add("INVALID_ISSUE_STATUS");
      if (issue.correctionPeriod === undefined) add("LEGACY_CORRECTION_PERIOD_ABSENT", "warning");
      period(issue.correctionPeriod);
      const history = list(issue.events);
      if (!Number.isSafeInteger(issue.revision) || issue.revision < 1 || history.length !== issue.revision) add("INVALID_ISSUE_REVISION");
      let previousTime = -Infinity;
      let projectedStatus = null, projectedReceipt = issue.originalReceiptId, projectedPeriod, projectedAssignee;
      for (const event of history) {
        counts.issueEvents++;
        if (!object(event) || !text(event.id)) { add("INVALID_ISSUE_EVENT"); continue; }
        const eventKey = key(invite.tenantId, event.id);
        if (eventIds.has(eventKey)) add("DUPLICATE_ISSUE_EVENT");
        eventIds.add(eventKey);
        if (!timestamp(event.occurredAt) || Date.parse(event.occurredAt) < previousTime || !text(event.actorUserId) || !["opened", "assigned", "commented", "resent", "reopened", "resolved"].includes(event.type) || !receiptFor(invite, event.receiptId, issue.kind)) add("INVALID_ISSUE_EVENT");
        previousTime = Date.parse(event.occurredAt);
        period(event.correctionPeriod);
        const entry = receipts.get(key(invite.tenantId, event.receiptId));
        if (!entry || entry.invite.id !== invite.id || Date.parse(event.occurredAt) < Date.parse(entry.receipt.receivedAt)) add("INVALID_ISSUE_EVENT_RECEIPT");
        if (event.type === "opened") {
          if (projectedStatus !== null || event !== history[0] || event.receiptId !== issue.originalReceiptId) add("INVALID_ISSUE_TRANSITION");
          projectedStatus = "open";
          projectedPeriod = event.correctionPeriod;
          projectedAssignee = event.assigneeUserId;
        } else if (event.type === "resent") {
          if (projectedStatus !== "open") add("INVALID_ISSUE_TRANSITION");
          if (!entry || entry.receipt.issueId !== issue.id || entry.receipt.replacesReceiptId !== projectedReceipt || event.receiptId === projectedReceipt || event.actorUserId !== `invite:${invite.id}` || event.evidence !== entry.receipt.digest) add("INVALID_CORRECTION_RECEIPT");
          issueRecords.get(id).resent.add(event.receiptId);
          projectedReceipt = event.receiptId;
          projectedStatus = "awaiting_review";
        } else {
          if (projectedStatus === null || event.receiptId !== projectedReceipt) add("INVALID_ISSUE_TRANSITION");
          if (event.type === "resolved" || event.type === "reopened") {
            if (projectedStatus !== "awaiting_review") add("INVALID_ISSUE_TRANSITION");
            if (projectedAssignee && event.actorUserId !== projectedAssignee) add("INVALID_REVIEW_ACTOR");
            projectedStatus = event.type === "resolved" ? "resolved" : "open";
            if (event.type === "reopened") projectedPeriod = event.correctionPeriod;
          }
          if (event.type === "assigned") projectedAssignee = event.assigneeUserId;
        }
      }
      const samePeriod = (a, b) => a === undefined && b === undefined || object(a) && object(b) && ["startedOn", "dueOn", "calendarDays", "timeZone"].every(field => a[field] === b[field]);
      if (projectedStatus !== issue.status || projectedReceipt !== issue.currentReceiptId || !samePeriod(projectedPeriod, issue.correctionPeriod) || projectedAssignee !== undefined && projectedAssignee !== issue.assigneeUserId) add("ISSUE_PROJECTION_MISMATCH");
      for (const receiptId of [issue.originalReceiptId, issue.currentReceiptId]) {
        if (receipts.get(key(invite.tenantId, receiptId))?.invite.id !== invite.id) add("INVALID_ISSUE_RECEIPT_OWNER");
      }
    }
  }
  for (const { receipt, invite } of receipts.values()) {
    if (receipt.issueId === undefined) continue;
    const record = issueRecords.get(key(invite.tenantId, receipt.issueId));
    if (!record || record.invite.id !== invite.id || record.issue.kind !== receipt.kind || !record.resent.has(receipt.id)) add("ORPHAN_CORRECTION_RECEIPT");
  }
  for (const approval of approvals) {
    counts.approvals++;
    if (!object(approval)) continue;
    if (!invitationIndex.has(key(approval.tenantId, approval.invitationId))) add("INVALID_APPROVAL_INVITATION");
    if (!timestamp(approval.approvedAt) || !text(approval.approvedBy) || !text(approval.notes) || typeof approval.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(approval.fingerprint)) add("INVALID_APPROVAL");
  }
  for (const schedule of schedules) {
    counts.schedules++;
    if (!object(schedule)) continue;
    const approval = approvalIndex.get(key(schedule.tenantId, schedule.approvalId));
    if (!approval || approval.invitationId !== schedule.invitationId || !invitationIndex.has(key(schedule.tenantId, schedule.invitationId))) add("INVALID_SCHEDULE_APPROVAL");
    if (!day(schedule.scheduledOn) || !timestamp(schedule.createdAt) || !text(schedule.createdBy)) add("INVALID_SCHEDULE");
  }
  const contractorEvaluations = evaluations.filter(evaluation => object(evaluation) && evaluation.documentSource === "contratada");
  index(contractorEvaluations, "DUPLICATE_CONTRACTOR_EVALUATION");
  for (const evaluation of evaluations) {
    if (!object(evaluation)) { add("INVALID_COMPLIANCE_EVALUATION"); continue; }
    if (evaluation.documentSource !== "contratada") {
      if (evaluation.documentSource === undefined && receipts.has(key(evaluation.tenantId, evaluation.documentId))) add("AMBIGUOUS_LEGACY_EVALUATION_SOURCE", "warning");
      continue;
    }
    counts.contractorEvaluations++;
    const entry = receipts.get(key(evaluation.tenantId, evaluation.documentId));
    const rule = ruleIndex.get(key(evaluation.tenantId, evaluation.ruleId));
    if (!entry || evaluation.companyId !== entry.invite.companyId || evaluation.unitId !== entry.invite.unitId || evaluation.documentKind !== entry.receipt.kind) add("INVALID_EVALUATION_RECEIPT_SCOPE");
    if (!rule || rule.documentKind !== evaluation.documentKind || rule.version !== evaluation.ruleVersion) add("INVALID_EVALUATION_RULE");
    if (!timestamp(evaluation.evaluatedAt) || !Number.isSafeInteger(evaluation.documentVersion) || evaluation.documentVersion < 1 || !["atende", "pendente", "inconclusivo", "nao_aplicavel"].includes(evaluation.result)) add("INVALID_CONTRACTOR_EVALUATION");
    if (entry && Date.parse(evaluation.evaluatedAt) < Date.parse(entry.receipt.receivedAt)) add("EVALUATION_BEFORE_RECEIPT");
    // Evidências podem apontar documentos internos: nunca resolver contra recibos por suposição.
    if (evaluation.evidenceDocumentId !== undefined && evaluation.evidenceDocumentId !== "" && !text(evaluation.evidenceDocumentId)) add("INVALID_EVIDENCE_REFERENCE");
    if (text(evaluation.evidenceDocumentId)) {
      counts.internalEvidenceReferences++;
      const evidence = documentIndex.get(key(evaluation.tenantId, evaluation.evidenceDocumentId));
      if (!evidence) add("INVALID_EVIDENCE_REFERENCE");
      else if (!timestamp(evidence.uploadedAt) || !Number.isSafeInteger(evidence.version) || evidence.version < 1 || !["received", "superseded", "archived"].includes(evidence.status)) add("INVALID_EVIDENCE_DOCUMENT");
      else if (Date.parse(evidence.uploadedAt) > Date.parse(evaluation.evaluatedAt)) add("EVIDENCE_AFTER_EVALUATION");
    }
  }
  const domainAudit = events.filter(event => object(event) && typeof event.action === "string" && event.action.startsWith("thirdparty."));
  index(domainAudit, "DUPLICATE_AUDIT_EVENT");
  for (const event of domainAudit) {
    counts.auditEvents++;
    if (!timestamp(event.occurredAt) || !text(event.actorUserId)) add("INVALID_AUDIT_EVENT");
    if (!["created", "revoked", "read", "downloaded", "portal_opened", "received", "issue_opened", "issue_reviewed", "issue_updated", "integration_approved", "integration_scheduled"].some(action => event.action === `thirdparty.${action}`)) { add("UNKNOWN_THIRDPARTY_AUDIT_ACTION"); continue; }
    if (!text(event.targetId)) { add("LEGACY_AUDIT_TARGET_ABSENT", "warning"); continue; }
    const target = key(event.tenantId, event.targetId);
    let valid;
    switch (event.action) {
      case "thirdparty.created": case "thirdparty.revoked": case "thirdparty.read": case "thirdparty.downloaded": case "thirdparty.portal_opened":
        valid = invitationIndex.has(target); break;
      case "thirdparty.received": valid = receipts.has(target); break;
      case "thirdparty.issue_opened": case "thirdparty.issue_reviewed": valid = issueIds.has(target); break;
      // Renovação de link usa essa mesma ação com o convite como alvo.
      case "thirdparty.issue_updated": valid = issueIds.has(target) || invitationIndex.has(target); break;
      case "thirdparty.integration_approved": valid = approvalIndex.has(target); break;
      case "thirdparty.integration_scheduled": valid = scheduleIndex.has(target); break;
      default: add("UNKNOWN_THIRDPARTY_AUDIT_ACTION"); continue;
    }
    if (!valid) add("INVALID_AUDIT_TARGET");
  }
  const issues = [...problems].map(([label, count]) => { const [severity, code] = label.split(":"); return { severity, code, count }; }).sort((a, b) => a.code.localeCompare(b.code));
  return { mode: "read-only-structural-analysis", counts, issues, blockers: issues.filter(item => item.severity === "blocker").reduce((sum, item) => sum + item.count, 0), importReady: false,
    pendingChecks: ["PDF_BYTES_AND_SAFE_PATHS", "INTERNAL_EVIDENCE_PDF_BYTES", "COMPLETE_SOURCE_CONTRACT", "TRANSACTIONAL_DEPENDENCIES"] };
}
