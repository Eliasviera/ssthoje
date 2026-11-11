"use client";

import { useState } from "react";
import type { CipaAlert, CipaOverview, CipaTermSummary } from "@/lib/cipa-overview-read";

// Painel de CIPA (NR-05 atualizada 2022, Portaria MTP nº 4.219/2022).
// Somente apresentação: nenhuma decisão normativa é tomada aqui.

const SEVERITY_LABEL: Record<CipaAlert["severity"], string> = {
  critical: "Crítico",
  warning: "Atenção",
  info: "Informativo",
};

const CONSTITUTION_LABEL: Record<string, string> = {
  elected: "Eleita",
  designated: "Designada",
  centralized: "Centralizada (contratada)",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  active: "Vigente",
};

const TARGET_LABEL: Record<CipaAlert["targetKind"], string> = {
  term: "Mandato",
  member: "Membro",
  contractor_scope: "Contratada",
  construction_site: "Obra",
  named_representative: "Representante nomeado",
  unit: "Estabelecimento",
};

function formatDate(isoDate: string | null) {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function daysLabel(days: number | undefined) {
  if (days === undefined) return "";
  if (days < 0) return `venceu há ${Math.abs(days)} dia(s)`;
  if (days === 0) return "vence hoje";
  return `em ${days} dia(s)`;
}

export default function CipaSection({ overview }: { overview: CipaOverview }) {
  const [tab, setTab] = useState<"paineis" | "alertas">("paineis");
  const { totals, terms, alerts } = overview;

  return (
    <section className="panel" aria-labelledby="cipa-title">
      <div className="panel-heading">
        <div>
          <h2 id="cipa-title">CIPA — Comissão Interna de Prevenção de Acidentes e de Assédio</h2>
          <p>
            Acompanhamento conforme a NR-05 (Portaria MTP nº 4.219/2022). Os prazos abaixo são
            calculados a partir da norma; a decisão sobre cada pendência é do responsável técnico.
          </p>
        </div>
      </div>

      <div className="cipa-totals" role="list" aria-label="Resumo da CIPA">
        <div className="cipa-total" role="listitem"><strong>{totals.activeTerms}</strong><span>Mandato(s) vigente(s)</span></div>
        <div className="cipa-total" role="listitem"><strong>{totals.membersActive}</strong><span>Membros ativos</span></div>
        <div className="cipa-total" role="listitem"><strong>{totals.meetingsHeldLast12Months}</strong><span>Reuniões realizadas (12 meses)</span></div>
        <div className="cipa-total" role="listitem"><strong>{totals.openActions}</strong><span>Ações em aberto</span></div>
        <div className="cipa-total" role="listitem"><strong>{totals.overdueActions}</strong><span>Ações atrasadas</span></div>
        <div className={`cipa-total${totals.criticalAlerts > 0 ? " is-critical" : ""}`} role="listitem"><strong>{totals.criticalAlerts}</strong><span>Alertas críticos</span></div>
        <div className="cipa-total" role="listitem"><strong>{totals.warningAlerts}</strong><span>Alertas de atenção</span></div>
      </div>

      <div className="company-detail-tabs" role="tablist" aria-label="Visões da CIPA">
        <button type="button" role="tab" aria-selected={tab === "paineis"} className={tab === "paineis" ? "company-detail-tab is-active" : "company-detail-tab"} onClick={() => setTab("paineis")}>Mandatos por estabelecimento</button>
        <button type="button" role="tab" aria-selected={tab === "alertas"} className={tab === "alertas" ? "company-detail-tab is-active" : "company-detail-tab"} onClick={() => setTab("alertas")}>Alertas ({alerts.length})</button>
      </div>

      {tab === "paineis" && (terms.length === 0
        ? <EmptyState message="Nenhum mandato de CIPA cadastrado para os estabelecimentos desta consultoria." />
        : <div className="cipa-terms">{terms.map((term) => <TermCard key={term.id} term={term} />)}</div>)}

      {tab === "alertas" && (alerts.length === 0
        ? <EmptyState message="Nenhuma pendência identificada nos critérios da NR-5 neste momento." />
        : <ol className="cipa-alerts">{alerts.map((alert, index) => (
            <li key={`${alert.code}-${alert.targetId}-${index}`} className={`cipa-alert is-${alert.severity}`}>
              <span className={`cipa-alert-badge is-${alert.severity}`}>{SEVERITY_LABEL[alert.severity]}</span>
              <div className="cipa-alert-body">
                <p>{alert.message}</p>
                <small>NR-5, item {alert.normItem} · {TARGET_LABEL[alert.targetKind]}{alert.daysRemaining === undefined ? "" : ` · ${daysLabel(alert.daysRemaining)}`}</small>
              </div>
            </li>
          ))}</ol>)}
    </section>
  );
}

function TermCard({ term }: { term: CipaTermSummary }) {
  const electionOverdue = term.electionDeadline !== null && term.status === "active";
  return (
    <article className="cipa-term">
      <header className="cipa-term-head">
        <div>
          <h3>{term.companyName}</h3>
          <p>{term.unitName} · Mandato {term.termNumber} · {CONSTITUTION_LABEL[term.constitution] ?? term.constitution}</p>
        </div>
        <span className={`client-status ${term.status === "active" ? "status-active" : "status-archived"}`}>{STATUS_LABEL[term.status] ?? term.status}</span>
      </header>

      <dl className="cipa-term-grid">
        <div><dt>Período do mandato</dt><dd>{formatDate(term.startedOn)} a {formatDate(term.endsOn)}</dd></div>
        <div><dt>Posse</dt><dd>{formatDate(term.possessionOn)}</dd></div>
        <div><dt>Grau de risco / empregados</dt><dd>GR {term.riskGrade} · {term.employeeCount} empregados</dd></div>
        <div><dt>Composição ativa</dt><dd>{term.membersActive} membro(s) · {term.titularesEmployer} titular(es) do empregador · {term.titularesEmployee} titular(es) dos empregados · {term.suplentes} suplente(s)</dd></div>
        <div><dt>Presidente / Vice</dt><dd>{term.hasPresident ? "Presidente ativo" : "Sem presidente"} · {term.hasVice ? "Vice ativo" : "Sem vice"}</dd></div>
        <div><dt>Última reunião ordinária</dt><dd>{formatDate(term.lastOrdinaryHeldAt)}</dd></div>
        <div className={electionOverdue ? "cipa-deadline" : undefined}><dt>Convocar eleição até (5.5.1)</dt><dd>{formatDate(term.electionDeadline)}</dd></div>
        <div><dt>Realizar a eleição até (5.5.3 f)</dt><dd>{formatDate(term.ballotDeadline)}</dd></div>
      </dl>
    </article>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="empty-state"><div className="empty-art"><span className="empty-art-circle" aria-hidden="true">·</span></div><h3>Sem registros para mostrar</h3><p>{message}</p></div>;
}
