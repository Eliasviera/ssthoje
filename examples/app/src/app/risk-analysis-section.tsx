"use client";

import { useActionState, useState, type MouseEvent } from "react";
import type { ClientCompany } from "@/lib/client-store";
import type { RiskAnalysis } from "@/lib/risk-analysis-store";
import {
  createRiskAnalysisAction,
  issueRiskAnalysisAction,
  saveRiskAnalysisDraftAction,
  type SafetyOperationsFormState,
} from "./safety-operations-actions";

function Feedback({ state }: { state: SafetyOperationsFormState }) {
  return <>{state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}{state.success && <p className="client-form-message client-form-success" role="status">{state.success}</p>}</>;
}

function RiskAnalysisFieldsForm({
  values,
  companies,
  recordId,
  revision,
  action,
  pending,
}: {
  values?: RiskAnalysis;
  companies: ClientCompany[];
  recordId?: string;
  revision?: number;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const [scope, setScope] = useState(values ? `${values.companyId}|${values.unitId}` : "");
  const [companyId, unitId] = scope.split("|");
  return <form action={action} className="pgr-form">
    {recordId && <><input type="hidden" name="recordId" value={recordId}/><input type="hidden" name="expectedRevision" value={revision}/></>}
    <label className="form-field pgr-wide">Empresa e unidade<select required value={scope} onChange={(event) => setScope(event.target.value)} disabled={Boolean(recordId)}><option value="" disabled>Selecione</option>{companies.filter((company) => company.status === "active").flatMap((company) => company.units.map((unit) => <option key={`${company.id}|${unit.id}`} value={`${company.id}|${unit.id}`}>{company.tradeName || company.legalName} · {unit.name}</option>))}</select></label>
    {!recordId && <><input type="hidden" name="companyId" value={companyId ?? ""}/><input type="hidden" name="unitId" value={unitId ?? ""}/></>}
    <label className="form-field pgr-wide">Título<input name="title" required maxLength={140} defaultValue={values?.title ?? ""} placeholder="Identificação desta análise"/></label>
    <label className="form-field pgr-wide">Atividade ou tarefa avaliada<textarea name="activity" required maxLength={1000} rows={3} defaultValue={values?.activity ?? ""}/></label>
    <label className="form-field pgr-wide">Local e condições observadas<textarea name="workArea" required maxLength={1000} rows={3} defaultValue={values?.workArea ?? ""}/></label>
    <label className="form-field pgr-wide">Análise profissional de riscos<textarea name="assessment" required maxLength={5000} rows={6} defaultValue={values?.assessment ?? ""} placeholder="Registre a avaliação realizada pelo profissional responsável."/></label>
    <label className="form-field pgr-wide">Medidas de controle e orientações definidas<textarea name="controls" required maxLength={5000} rows={6} defaultValue={values?.controls ?? ""} placeholder="Registre as medidas definidas pelo profissional responsável."/></label>
    <label className="form-field pgr-wide">Profissional responsável pela análise<input name="responsibleName" required maxLength={120} defaultValue={values?.responsibleName ?? ""}/></label>
    <button className="secondary-button" disabled={pending}>{pending ? "Salvando…" : recordId ? "Salvar revisão do rascunho" : "Criar rascunho de AR"}</button>
  </form>;
}

function printRiskAnalysis(event: MouseEvent<HTMLButtonElement>) {
  const card = event.currentTarget.closest(".risk-analysis-card");
  if (!card) return;
  const copy = document.createElement("div");
  copy.className = "risk-analysis-print-copy";
  copy.appendChild(card.cloneNode(true));
  copy.querySelector(".risk-analysis-controls")?.remove();
  copy.querySelectorAll("button").forEach((button) => button.remove());
  document.body.appendChild(copy);
  try {
    window.print();
  } finally {
    copy.remove();
  }
}

function RiskAnalysisRecord({ record, companies }: { record: RiskAnalysis; companies: ClientCompany[] }) {
  const [issueState, issueAction, issuePending] = useActionState(issueRiskAnalysisAction, {});
  const company = companies.find((entry) => entry.id === record.companyId);
  const unit = company?.units.find((entry) => entry.id === record.unitId);
  const issuedDate = record.issuedAt
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(record.issuedAt))
    : null;
  return <article className="pgr-card risk-analysis-card">
    <header><div><h3>{record.title}</h3><p>{company?.tradeName || company?.legalName || "Empresa arquivada"} · {unit?.name ?? "Unidade"}</p></div><span className="period-label">{record.status === "issued" ? `Emitida · revisão ${record.revision}` : `Rascunho · revisão ${record.revision}`}</span></header>
    <p><strong>Atividade:</strong> {record.activity}</p>
    <p><strong>Local e condições observadas:</strong> {record.workArea}</p>
    <p><strong>Análise profissional de riscos:</strong></p><p className="risk-analysis-preserve">{record.assessment}</p>
    <p><strong>Medidas de controle e orientações:</strong></p><p className="risk-analysis-preserve">{record.controls}</p>
    <p><strong>Profissional responsável:</strong> {record.responsibleName}</p>
    {record.status === "issued" && <p><strong>Emissão:</strong> {issuedDate} · conta SST autorizada · revisão {record.revision}</p>}
    <details className="risk-analysis-history"><summary>Histórico de revisões · {record.history.length}</summary><ol>{record.history.map((entry) => <li key={`${entry.revision}-${entry.action}`}>Revisão {entry.revision} · {entry.action === "created" ? "criada" : entry.action === "saved" ? "salva" : "emitida"} · {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.occurredAt))}</li>)}</ol></details>
    {record.status === "draft" ? <div className="risk-analysis-controls">
      <RiskAnalysisDraftEditor record={record} companies={companies}/>
      <form action={issueAction} className="pgr-form"><input type="hidden" name="recordId" value={record.id}/><input type="hidden" name="expectedRevision" value={record.revision}/><label className="operations-check"><input type="checkbox" name="confirmIssue" value="yes" required/><span>Revisei o conteúdo e confirmo a emissão desta AR como profissional responsável.</span></label><p className="permission-note">A emissão fica atribuída à conta SST autenticada. O sistema não verifica habilitação profissional nem valida os critérios técnicos registrados.</p><Feedback state={issueState}/><button className="primary-button" disabled={issuePending}>{issuePending ? "Emitindo…" : "Emitir AR"}</button></form>
    </div> : <button className="secondary-button" type="button" onClick={printRiskAnalysis}>Imprimir ou salvar em PDF</button>}
  </article>;
}

function RiskAnalysisDraftEditor({ record, companies }: { record: RiskAnalysis; companies: ClientCompany[] }) {
  const [state, action, pending] = useActionState(saveRiskAnalysisDraftAction, {});
  return <details className="aso-new"><summary>Editar rascunho</summary><RiskAnalysisFieldsForm values={record} companies={companies} recordId={record.id} revision={record.revision} action={action} pending={pending}/><Feedback state={state}/></details>;
}

export default function RiskAnalysisSection({
  records,
  companies,
}: {
  records: RiskAnalysis[];
  companies: ClientCompany[];
}) {
  const [state, action, pending] = useActionState(createRiskAnalysisAction, {});
  return <section className="panel pgr-section risk-analysis-section" aria-labelledby="risk-analysis-title">
    <div className="panel-heading"><div><h2 id="risk-analysis-title">AR · Análise de Risco</h2><p>Documento independente da APR e do PGR. O conteúdo técnico é registrado e avaliado pelo profissional responsável.</p></div><span className="period-label">{records.length} AR(s)</span></div>
    <div className="document-warning"><strong>Responsabilidade profissional.</strong> Não há checklist ou critério normativo pré-carregado. A permissão depende do perfil SST definido no sistema; a qualificação profissional não é verificada automaticamente. A emissão registra a decisão do profissional e não libera automaticamente uma atividade.</div>
    <details className="aso-new" open={!records.length}><summary>Nova AR · rascunho</summary><RiskAnalysisFieldsForm companies={companies} action={action} pending={pending}/><Feedback state={state}/></details>
    <div className="issue-filter"><h3>Análises registradas · {records.length}</h3></div>
    {!records.length && <p className="permission-note">Nenhuma AR foi registrada para esta consultoria.</p>}
    {records.map((record) => <RiskAnalysisRecord key={record.id} record={record} companies={companies}/>)}
  </section>;
}
