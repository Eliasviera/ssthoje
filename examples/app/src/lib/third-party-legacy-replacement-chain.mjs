function normalizedScope(value) {
  return typeof value === "string" && value.trim()
    ? value.trim().toLocaleLowerCase("pt-BR")
    : null;
}

function sameSeries(left, right) {
  const leftScope = normalizedScope(left.scopeText);
  const rightScope = normalizedScope(right.scopeText);
  return left.tenantId === right.tenantId
    && left.sourceStore === right.sourceStore
    && left.sourceKind === right.sourceKind
    && left.companyId === right.companyId
    && left.unitId === right.unitId
    && left.contractorCnpj === right.contractorCnpj
    && (leftScope && rightScope ? leftScope === rightScope : left.invitationId === right.invitationId);
}

function validIdentity(receipt) {
  return receipt
    && [receipt.tenantId, receipt.sourceStore, receipt.invitationId, receipt.receiptId, receipt.sourceKind].every(
      (value) => typeof value === "string" && value.trim(),
    )
    && typeof receipt.receivedAt === "string"
    && Number.isFinite(Date.parse(receipt.receivedAt));
}

/** Validates legacy replacement evidence only; it does not create a document series. */
export function validateLegacyReceiptReplacementChain(receipts, currentReceiptId) {
  if (!Array.isArray(receipts) || !receipts.every(validIdentity)) {
    return { ok: false, reason: "invalid_snapshot" };
  }

  const currentCandidates = receipts.filter((receipt) => receipt.receiptId === currentReceiptId);
  if (currentCandidates.length !== 1) {
    return { ok: false, reason: currentCandidates.length ? "ambiguous_receipt" : "receipt_missing" };
  }
  const current = currentCandidates[0];
  if (!current.confirmedCaseKey || typeof current.confirmedCaseKey !== "string") {
    return { ok: false, reason: "case_unconfirmed" };
  }

  const chain = [];
  const seen = new Set();
  let child = current;
  while (child) {
    if (seen.has(child.receiptId)) return { ok: false, reason: "cycle" };
    seen.add(child.receiptId);
    chain.push(child.receiptId);

    const parentId = child.replacesReceiptId;
    if (!parentId) break;
    const parents = receipts.filter((candidate) =>
      candidate.tenantId === child.tenantId
      && candidate.sourceStore === child.sourceStore
      && candidate.receiptId === parentId,
    );
    if (parents.length === 0) return { ok: false, reason: "predecessor_missing" };
    if (parents.length !== 1) return { ok: false, reason: "predecessor_ambiguous" };

    const parent = parents[0];
    if (seen.has(parent.receiptId)) return { ok: false, reason: "cycle" };
    if (!sameSeries(parent, child)) return { ok: false, reason: "series_mismatch" };
    if (!parent.confirmedCaseKey || parent.confirmedCaseKey !== current.confirmedCaseKey) {
      return { ok: false, reason: "case_mismatch" };
    }
    if (Date.parse(parent.receivedAt) > Date.parse(child.receivedAt)) {
      return { ok: false, reason: "time_order" };
    }

    const siblings = receipts.filter((candidate) =>
      candidate.tenantId === parent.tenantId
      && candidate.sourceStore === parent.sourceStore
      && candidate.replacesReceiptId === parent.receiptId
      && sameSeries(candidate, parent),
    );
    if (siblings.length !== 1 || siblings[0].receiptId !== child.receiptId) {
      return { ok: false, reason: "fork" };
    }

    child = parent;
  }

  return { ok: true, chain };
}
