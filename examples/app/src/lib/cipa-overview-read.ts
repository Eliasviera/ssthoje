import "server-only";

import type { PoolClient } from "pg";
import type { TenantReadContext } from "./tenant-read-transaction";

// Leitura do painel de CIPA (NR-05 atualizada 2022, Portaria MTP nº 4.219/2022).
// Somente leitura: este módulo não grava nada. A regra de negócio fica no SQL para que
// o alerta seja auditável e independente da tela.

export type CipaAlertSeverity = "critical" | "warning" | "info";

export type CipaAlert = {
  code: string;
  severity: CipaAlertSeverity;
  /** Item da NR-5 que fundamenta o alerta. */
  normItem: string;
  message: string;
  /** Alvo: mandato, membro, contratada ou obra. */
  targetKind: "term" | "member" | "contractor_scope" | "construction_site" | "named_representative" | "unit";
  targetId: string;
  daysRemaining?: number;
};

export type CipaTermSummary = {
  id: string;
  companyName: string;
  unitName: string;
  termNumber: number;
  constitution: string;
  status: string;
  startedOn: string;
  endsOn: string;
  possessionOn: string | null;
  riskGrade: number;
  employeeCount: number;
  membersActive: number;
  titularesEmployer: number;
  titularesEmployee: number;
  suplentes: number;
  hasPresident: boolean;
  hasVice: boolean;
  /** Data limite para convocar a próxima eleição (5.5.1: 60 dias antes do fim). */
  electionDeadline: string | null;
  /** Data limite para realizar a eleição (5.5.3 f: 30 dias antes do fim). */
  ballotDeadline: string | null;
  lastOrdinaryHeldAt: string | null;
  nextOrdinaryDue: string | null;
};

export type CipaOverview = {
  terms: CipaTermSummary[];
  alerts: CipaAlert[];
  /** Contadores para o cabeçalho do painel. */
  totals: {
    activeTerms: number;
    membersActive: number;
    meetingsHeldLast12Months: number;
    openActions: number;
    overdueActions: number;
    criticalAlerts: number;
    warningAlerts: number;
  };
};

// ---------------------------------------------------------------- leitura

export async function loadCipaOverviewInTransaction(
  client: PoolClient,
  context: TenantReadContext,
  today: string,
): Promise<CipaOverview> {
  const tenantId = context.tenantId;

  const terms = await client.query<{
    id: string; term_number: number; constitution: string; status: string;
    started_on: Date | string; ends_on: Date | string; possession_on: Date | string | null;
    risk_grade: number; employee_count: number;
    company_name: string; unit_name: string;
  }>(
    `SELECT t.id, t.term_number, t.constitution, t.status, t.started_on, t.ends_on, t.possession_on,
            t.risk_grade, t.employee_count,
            COALESCE(c.trade_name, c.legal_name) AS company_name,
            u.name AS unit_name
       FROM sst.cipa_terms t
       JOIN sst.client_companies c ON c.tenant_id = t.tenant_id AND c.id = t.company_id
       JOIN sst.client_units u ON u.tenant_id = t.tenant_id AND u.id = t.unit_id
      WHERE t.tenant_id = $1 AND t.status IN ('draft', 'active')
      ORDER BY COALESCE(c.trade_name, c.legal_name), u.name, t.term_number`,
    [tenantId],
  );

  const summaries: CipaTermSummary[] = [];
  for (const term of terms.rows) {
    const composition = await client.query<{
      representation: string; seat: string; role: string; total: number;
    }>(
      `SELECT representation, seat, role, count(*)::int AS total
         FROM sst.cipa_members
        WHERE tenant_id = $1 AND term_id = $2 AND status = 'active'
        GROUP BY representation, seat, role`,
      [tenantId, term.id],
    );

    let membersActive = 0, titularesEmployer = 0, titularesEmployee = 0, suplentes = 0;
    let hasPresident = false, hasVice = false;
    for (const row of composition.rows) {
      membersActive += row.total;
      if (row.seat === "titular" && row.representation === "employer") titularesEmployer += row.total;
      if (row.seat === "titular" && row.representation === "employee") titularesEmployee += row.total;
      if (row.seat === "suplente") suplentes += row.total;
      if (row.role === "president") hasPresident = true;
      if (row.role === "vice_president") hasVice = true;
    }

    const meetings = await client.query<{ last_held: Date | string | null }>(
      `SELECT max(held_at) AS last_held
         FROM sst.cipa_meetings
        WHERE tenant_id = $1 AND term_id = $2 AND meeting_type = 'ordinary' AND status = 'held'`,
      [tenantId, term.id],
    );
    const lastOrdinaryHeldAt = meetings.rows[0]?.last_held ? new Date(meetings.rows[0].last_held).toISOString().slice(0, 10) : null;

    const endsOn = new Date(term.ends_on).toISOString().slice(0, 10);
    summaries.push({
      id: term.id,
      companyName: term.company_name,
      unitName: term.unit_name,
      termNumber: term.term_number,
      constitution: term.constitution,
      status: term.status,
      startedOn: new Date(term.started_on).toISOString().slice(0, 10),
      endsOn,
      possessionOn: term.possession_on ? new Date(term.possession_on).toISOString().slice(0, 10) : null,
      riskGrade: term.risk_grade,
      employeeCount: term.employee_count,
      membersActive,
      titularesEmployer,
      titularesEmployee,
      suplentes,
      hasPresident,
      hasVice,
      electionDeadline: shiftDays(endsOn, -60),
      ballotDeadline: shiftDays(endsOn, -30),
      lastOrdinaryHeldAt,
      nextOrdinaryDue: lastOrdinaryHeldAt ? shiftDays(addMonths(lastOrdinaryHeldAt, 1), 0) : null,
    });
  }

  const alerts = await loadCipaAlertsInTransaction(client, tenantId, today);

  const counters = await client.query<{
    meetings_held: number; open_actions: number; overdue_actions: number; members_active: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM sst.cipa_meetings
         WHERE tenant_id = $1 AND status = 'held' AND held_at >= ($2::date - interval '12 months')) AS meetings_held,
       (SELECT count(*)::int FROM sst.cipa_actions WHERE tenant_id = $1 AND status IN ('open', 'in_progress')) AS open_actions,
       (SELECT count(*)::int FROM sst.cipa_actions
         WHERE tenant_id = $1 AND status IN ('open', 'in_progress') AND due_on < $2::date) AS overdue_actions,
       (SELECT count(*)::int FROM sst.cipa_members WHERE tenant_id = $1 AND status = 'active') AS members_active`,
    [tenantId, today],
  );
  const counter = counters.rows[0];

  return {
    terms: summaries,
    alerts,
    totals: {
      activeTerms: summaries.filter((term) => term.status === "active").length,
      membersActive: counter?.members_active ?? 0,
      meetingsHeldLast12Months: counter?.meetings_held ?? 0,
      openActions: counter?.open_actions ?? 0,
      overdueActions: counter?.overdue_actions ?? 0,
      criticalAlerts: alerts.filter((alert) => alert.severity === "critical").length,
      warningAlerts: alerts.filter((alert) => alert.severity === "warning").length,
    },
  };
}

/**
 * Alertas da NR-5. Cada alerta cita o item que o fundamenta e nunca decide pelo usuário:
 * aponta a pendência e o prazo legal, deixando a ação para o responsável técnico.
 */
export async function loadCipaAlertsInTransaction(
  client: PoolClient,
  tenantId: string,
  today: string,
): Promise<CipaAlert[]> {
  const result = await client.query<{
    code: string; severity: CipaAlertSeverity; norm_item: string; message: string;
    target_kind: CipaAlert["targetKind"]; target_id: string; days_remaining: number | null;
  }>(
    `
    -- 1. Mandato vencido ou vencendo (5.4.6 / 5.4.7).
    SELECT 'term.ending'::text AS code,
           CASE WHEN t.ends_on < $2::date THEN 'critical' ELSE 'warning' END::text AS severity,
           '5.4.6'::text AS norm_item,
           format('Mandato %s da CIPA de %s (%s) %s', t.term_number,
                  COALESCE(c.trade_name, c.legal_name), u.name,
                  CASE WHEN t.ends_on < $2::date THEN 'venceu em ' ELSE 'vence em ' END || to_char(t.ends_on, 'DD/MM/YYYY')) AS message,
           'term'::text AS target_kind, t.id AS target_id,
           (t.ends_on - $2::date) AS days_remaining
      FROM sst.cipa_terms t
      JOIN sst.client_companies c ON c.tenant_id = t.tenant_id AND c.id = t.company_id
      JOIN sst.client_units u ON u.tenant_id = t.tenant_id AND u.id = t.unit_id
     WHERE t.tenant_id = $1 AND t.status = 'active' AND t.ends_on <= ($2::date + interval '90 days')

    UNION ALL
    -- 2. Convocação da eleição fora do prazo de 60 dias antes do término (5.5.1).
    SELECT 'election.call_notice', 'critical', '5.5.1',
           format('Convocar eleição da CIPA de %s (%s) até %s — mínimo de 60 dias antes do fim do mandato',
                  COALESCE(c.trade_name, c.legal_name), u.name, to_char(t.ends_on - 60, 'DD/MM/YYYY')),
           'term', t.id, (t.ends_on - 60 - $2::date)::int
      FROM sst.cipa_terms t
      JOIN sst.client_companies c ON c.tenant_id = t.tenant_id AND c.id = t.company_id
      JOIN sst.client_units u ON u.tenant_id = t.tenant_id AND u.id = t.unit_id
     WHERE t.tenant_id = $1 AND t.status = 'active'
       AND t.ends_on - 60 <= $2::date
       -- A conversão da eleição é registrada como reunião extraordinária da comissão eleitoral.
       AND NOT EXISTS (
         SELECT 1 FROM sst.cipa_meetings m
          WHERE m.tenant_id = t.tenant_id AND m.term_id = t.id
            AND m.meeting_type = 'extraordinary'
       )

    UNION ALL
    -- 3. Composição incompleta: falta presidente (5.4.5).
    SELECT 'composition.missing_president', 'critical', '5.4.5',
           format('CIPA de %s (%s) sem presidente ativo designado', COALESCE(c.trade_name, c.legal_name), u.name),
           'term', t.id, NULL
      FROM sst.cipa_terms t
      JOIN sst.client_companies c ON c.tenant_id = t.tenant_id AND c.id = t.company_id
      JOIN sst.client_units u ON u.tenant_id = t.tenant_id AND u.id = t.unit_id
     WHERE t.tenant_id = $1 AND t.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM sst.cipa_members m
                        WHERE m.tenant_id = t.tenant_id AND m.term_id = t.id
                          AND m.role = 'president' AND m.status = 'active')

    UNION ALL
    -- 4. Composição incompleta: falta vice-presidente (5.4.5).
    SELECT 'composition.missing_vice', 'warning', '5.4.5',
           format('CIPA de %s (%s) sem vice-presidente ativo entre os eleitos', COALESCE(c.trade_name, c.legal_name), u.name),
           'term', t.id, NULL
      FROM sst.cipa_terms t
      JOIN sst.client_companies c ON c.tenant_id = t.tenant_id AND c.id = t.company_id
      JOIN sst.client_units u ON u.tenant_id = t.tenant_id AND u.id = t.unit_id
     WHERE t.tenant_id = $1 AND t.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM sst.cipa_members m
                        WHERE m.tenant_id = t.tenant_id AND m.term_id = t.id
                          AND m.role = 'vice_president' AND m.status = 'active')

    UNION ALL
    -- 5. Reunião ordinária atrasada (5.6.1: mensal).
    SELECT 'meeting.ordinary_overdue', 'warning', '5.6.1',
           format('CIPA de %s (%s): última reunião ordinária em %s — reunião mensal pendente',
                  COALESCE(c.trade_name, c.legal_name), u.name, to_char(last_held, 'DD/MM/YYYY')),
           'term', t.id, ((last_held + interval '1 month')::date - $2::date)::int
      FROM (
        SELECT t.id, t.tenant_id, t.company_id, t.unit_id, max(m.held_at)::date AS last_held
          FROM sst.cipa_terms t
          LEFT JOIN sst.cipa_meetings m
            ON m.tenant_id = t.tenant_id AND m.term_id = t.id
           AND m.meeting_type = 'ordinary' AND m.status = 'held'
         WHERE t.tenant_id = $1 AND t.status = 'active'
         GROUP BY t.id, t.tenant_id, t.company_id, t.unit_id
      ) t
      JOIN sst.client_companies c ON c.tenant_id = t.tenant_id AND c.id = t.company_id
      JOIN sst.client_units u ON u.tenant_id = t.tenant_id AND u.id = t.unit_id
     WHERE last_held IS NOT NULL AND (last_held + interval '1 month')::date < $2::date

    UNION ALL
    -- 6. Treinamento de membro vencido ou vencendo (5.7.1 / 5.7.3).
    SELECT 'member.training_expiring', 'warning', '5.7.1',
           format('%s (%s): treinamento de CIPA com validade em %s',
                  m.worker_id, COALESCE(c.trade_name, c.legal_name), to_char(m.training_valid_until, 'DD/MM/YYYY')),
           'member', m.id, (m.training_valid_until - $2::date)::int
      FROM sst.cipa_members m
      JOIN sst.cipa_terms t ON t.tenant_id = m.tenant_id AND t.id = m.term_id
      JOIN sst.client_companies c ON c.tenant_id = t.tenant_id AND c.id = t.company_id
     WHERE m.tenant_id = $1 AND m.status = 'active' AND t.status = 'active'
       AND m.training_valid_until IS NOT NULL
       AND m.training_valid_until <= ($2::date + interval '60 days')

    UNION ALL
    -- 7. Estabilidade terminando (5.4.12: um ano após o fim do mandato).
    SELECT 'member.stability_ending', 'info', '5.4.12',
           format('%s: estabilidade de membro eleito termina em %s',
                  m.worker_id, to_char(m.stability_until, 'DD/MM/YYYY')),
           'member', m.id, (m.stability_until - $2::date)::int      FROM sst.cipa_members m
     WHERE m.tenant_id = $1 AND m.status = 'active'
       AND m.stability_until IS NOT NULL
       AND m.stability_until <= ($2::date + interval '90 days')

    UNION ALL
    -- 8. Membro com mais de 4 faltas ordinárias sem justificativa (5.6.6).
    SELECT 'member.excess_absences', 'critical', '5.6.6',
           format('%s: %s faltas em reuniões ordinárias — perda de mandato prevista no item 5.6.6',
                  m.worker_id, a.faltas),
           'member', m.id, NULL
      FROM sst.cipa_members m
      JOIN LATERAL (
        SELECT count(*)::int AS faltas
          FROM sst.cipa_meeting_attendance at
          JOIN sst.cipa_meetings mt
            ON mt.tenant_id = at.tenant_id AND mt.id = at.meeting_id
         WHERE at.tenant_id = m.tenant_id AND at.member_id = m.id
           AND at.attendance = 'absent'
           AND mt.meeting_type = 'ordinary' AND mt.status = 'held'
      ) a ON true
     WHERE m.tenant_id = $1 AND m.status = 'active' AND a.faltas > 4

    UNION ALL
    -- 9. Contratada obrigada a nomear representante sem nomeação vigente (5.8.2 / 5.8.6).
    SELECT 'contractor.missing_named_representative', 'critical', '5.8.2',
           format('%s (%s empregados no local): arranjo exige representante nomeado da NR-05',
                  s.contractor_name, s.employees_on_site),
           'contractor_scope', s.id, NULL
      FROM sst.cipa_contractor_scopes s
     WHERE s.tenant_id = $1 AND s.status = 'active'
       AND s.arrangement = 'named_representative'
       AND NOT EXISTS (
         SELECT 1 FROM sst.cipa_named_representatives r
          WHERE r.tenant_id = s.tenant_id AND r.company_id = s.company_id
            AND r.unit_id = s.unit_id AND r.status = 'active' AND r.valid_until >= $2::date
       )

    UNION ALL
    -- 10. Contratante não convidou a contratada para a reunião da CIPA (5.8.7).
    SELECT 'contractor.meeting_invitation_missing', 'warning', '5.8.7',
           format('%s: convite para a reunião da CIPA da contratante não registrado', s.contractor_name),
           'contractor_scope', s.id, NULL
      FROM sst.cipa_contractor_scopes s
     WHERE s.tenant_id = $1 AND s.status = 'active' AND s.meeting_invitation_at IS NULL

    UNION ALL
    -- 11. Representante nomeado com nomeação vencida (5.4.14).
    SELECT 'named_representative.expired', 'critical', '5.4.14',
           format('%s: nomeação como representante da NR-05 venceu em %s',
                  r.worker_id, to_char(r.valid_until, 'DD/MM/YYYY')),
           'named_representative', r.id, (r.valid_until - $2::date)
      FROM sst.cipa_named_representatives r
     WHERE r.tenant_id = $1 AND r.status = 'active' AND r.valid_until < $2::date

    UNION ALL
    -- 12. Obra com prazo que excede a dispensa de 180 dias sem CIPA (Anexo I 3.3).
    SELECT 'construction.site_past_exemption', 'warning', 'Anexo I 3.3',
           format('Obra %s (%s): passou de 180 dias sem CIPA de canteiro', cs.site_code, cs.site_name),
           'construction_site', cs.id, NULL
      FROM sst.cipa_construction_sites cs
     WHERE cs.tenant_id = $1 AND cs.status = 'active' AND cs.term_id IS NULL
       AND cs.started_on + 180 < $2::date

    UNION ALL
    -- 13. Frente de trabalho sem representante nomeado (Anexo I 3.1.3).
    SELECT 'construction.front_without_representative', 'warning', 'Anexo I 3.1.3',
           format('Obra %s: %s frente(s) de trabalho e nenhum representante nomeado ativo', cs.site_code, cs.work_fronts),
           'construction_site', cs.id, NULL
      FROM sst.cipa_construction_sites cs
     WHERE cs.tenant_id = $1 AND cs.status = 'active' AND cs.work_fronts > 0
       AND NOT EXISTS (
         SELECT 1 FROM sst.cipa_site_representatives sr
          WHERE sr.tenant_id = cs.tenant_id AND sr.site_id = cs.id AND sr.status = 'active'
       )

    UNION ALL
    -- 14. Prazo de guarda documental: mandato encerrado há menos de 5 anos ainda obriga guarda (5.9.2).
    SELECT 'term.retention_window', 'info', '5.9.2',
           format('Mandato %s de %s: guardar a documentação da CIPA até %s',
                  t.term_number, COALESCE(c.trade_name, c.legal_name),
                  to_char(t.ends_on + interval '5 years', 'DD/MM/YYYY')),
           'term', t.id, (t.ends_on + interval '5 years')::date - $2::date
      FROM sst.cipa_terms t
      JOIN sst.client_companies c ON c.tenant_id = t.tenant_id AND c.id = t.company_id
     WHERE t.tenant_id = $1 AND t.status = 'ended'
       AND t.ends_on + interval '5 years' > $2::date
    `,
    [tenantId, today],
  );

  return result.rows.map((row) => ({
    code: row.code,
    severity: row.severity,
    normItem: row.norm_item,
    message: row.message,
    targetKind: row.target_kind,
    targetId: row.target_id,
    ...(row.days_remaining === null ? {} : { daysRemaining: Number(row.days_remaining) }),
  }));
}

// ---------------------------------------------------------------- utilitários de data

/** Soma dias a uma data AAAA-MM-DD sem depender do fuso do servidor. */
export function shiftDays(isoDate: string, days: number): string {
  const base = new Date(`${isoDate}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Soma meses a uma data AAAA-MM-DD, ajustando ao último dia do mês quando necessário. */
export function addMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}
