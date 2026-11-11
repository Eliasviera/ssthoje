import "server-only";

import type { PoolClient } from "pg";
import { withCurrentTenantWriteTransaction } from "./tenant-write-transaction";
import { withCurrentTenantReadTransaction } from "./tenant-read-transaction";

// Escrita do catálogo NR-5 e das datas de referência dos mandatos.
// Nenhuma regra normativa é criada aqui: o conteúdo vem da conferência humana da norma oficial.

export type Nr5StandardInput = {
  id: string;
  edition: string;
  issuingAct: string;
  issuedAt: string | null;
  validFrom: string;
  sourceUrl: string;
  sourceHash: string;
};

export type Nr5BandInput = {
  id: string;
  standardId: string;
  riskGrade: number;
  employeesFrom: number;
  employeesTo: number | null;
  effectiveMembers: number;
  substituteMembers: number;
};

export type Nr5TrainingInput = {
  id: string;
  standardId: string;
  audience: "cipa_member" | "named_representative";
  riskGrade: number | null;
  minHours: number;
  distanceLearningAllowed: boolean;
};

export type Nr5ElectionRuleInput = {
  id: string;
  standardId: string;
  code: string;
  description: string;
  minDays: number | null;
  sourceItem: string;
};

/** Rascunho do catálogo: a edição e as faixas entram como 'draft', sem publicar. */
export function saveNr5Draft(input: {
  standard: Nr5StandardInput;
  bands: Nr5BandInput[];
  training: Nr5TrainingInput[];
  rules: Nr5ElectionRuleInput[];
}) {
  return withCurrentTenantWriteTransaction("operations.manage", undefined, async (client, context) => {
    await client.query(
      `INSERT INTO sst.nr5_standards (id, edition, issuing_act, issued_at, valid_from, source_url, source_hash, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'draft')`,
      [input.standard.id, input.standard.edition, input.standard.issuingAct, input.standard.issuedAt,
       input.standard.validFrom, input.standard.sourceUrl, input.standard.sourceHash],
    );
    for (const band of input.bands) {
      await client.query(
        `INSERT INTO sst.nr5_dimension_bands
           (id, standard_id, risk_grade, employees_from, employees_to, effective_members, substitute_members)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [band.id, band.standardId, band.riskGrade, band.employeesFrom, band.employeesTo,
         band.effectiveMembers, band.substituteMembers],
      );
    }
    for (const item of input.training) {
      await client.query(
        `INSERT INTO sst.nr5_training_requirements
           (id, standard_id, audience, risk_grade, min_hours, distance_learning_allowed)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [item.id, item.standardId, item.audience, item.riskGrade, item.minHours, item.distanceLearningAllowed],
      );
    }
    for (const rule of input.rules) {
      await client.query(
        `INSERT INTO sst.nr5_election_rules (id, standard_id, code, description, min_days, source_item)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [rule.id, rule.standardId, rule.code, rule.description, rule.minDays, rule.sourceItem],
      );
    }
    // A publicação é uma etapa separada, com revisor e data.
    return { standardId: input.standard.id, tenantId: context.tenantId };
  });
}

/** Publica a edição conferida. O banco exige revisor e data para o status 'active'. */
export function publishNr5Standard(input: { standardId: string; reviewer: string; notes: string; method: "manual_transcription" | "assisted_extraction" }) {
  return withCurrentTenantWriteTransaction("operations.manage", undefined, async (client, context) => {
    const standard = await client.query<{ source_hash: string; status: string }>(
      "SELECT source_hash, status FROM sst.nr5_standards WHERE id = $1",
      [input.standardId],
    );
    if (standard.rowCount === 0) throw new Error("Edição da NR-5 não encontrada.");
    if (standard.rows[0].status !== "draft") throw new Error("Somente uma edição em rascunho pode ser publicada.");

    await client.query(
      `UPDATE sst.nr5_standards
          SET status = 'active', reviewer = $1, reviewed_at = clock_timestamp(),
              published_by = $2, published_at = clock_timestamp()
        WHERE id = $3`,
      [input.reviewer, context.userId, input.standardId],
    );
    await client.query(
      `INSERT INTO sst.nr5_standard_reviews (tenant_id, id, standard_id, reviewer, decision, source_hash, method, notes, reviewed_at)
       VALUES ($1, gen_random_uuid()::text, $2, $3, 'approved', $4, $5, $6, clock_timestamp())`,
      [context.tenantId, input.standardId, input.reviewer, standard.rows[0].source_hash, input.method, input.notes],
    );
    return { standardId: input.standardId };
  });
}

/**
 * Atualiza as datas de referência do mandato (fim do mandato e posse).
 * O mandato em si é criado por fluxo próprio; aqui só se corrige a vigência.
 */
export function updateTermDates(input: { termId: string; endsOn: string; possessionOn: string | null; reason: string }) {
  return withCurrentTenantWriteTransaction("operations.manage", undefined, async (client, context) => {
    const result = await client.query(
      `UPDATE sst.cipa_terms
          SET ends_on = $1, possession_on = $2
        WHERE tenant_id = $3 AND id = $4 AND status IN ('draft', 'active')`,
      [input.endsOn, input.possessionOn, context.tenantId, input.termId],
    );
    if (result.rowCount === 0) throw new Error("Mandato não encontrado ou já encerrado.");
    await client.query(
      `INSERT INTO sst.cipa_events (tenant_id, id, term_id, target_kind, target_id, action, actor_user_id, reason, occurred_at)
       VALUES ($1, gen_random_uuid()::text, $2, 'term', $2, 'term.activated', $3, $4, clock_timestamp())`,
      [context.tenantId, input.termId, context.userId, input.reason.slice(0, 1900)],
    );
    return { termId: input.termId };
  });
}

/** Catálogo publicado, para o formulário de mandato escolher a edição de referência. */
export function listPublishedNr5Standards() {
  return withCurrentTenantReadTransaction("operations.read", undefined, async (client: PoolClient) => {
    const result = await client.query<{ id: string; edition: string; issuing_act: string; valid_from: Date | string }>(
      `SELECT id, edition, issuing_act, valid_from FROM sst.nr5_standards
        WHERE status = 'active' ORDER BY valid_from DESC`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      edition: row.edition,
      issuingAct: row.issuing_act,
      validFrom: new Date(row.valid_from).toISOString().slice(0, 10),
    }));
  });
}
