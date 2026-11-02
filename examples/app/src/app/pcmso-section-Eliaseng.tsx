"use client";

import { useActionState, useState } from "react";
import type { ClientCompany } from "@/lib/client-store";
import type { PcmsoRecord, PcmsoSummary } from "@/lib/pcmso-store";
import type { PgrRiskOptionSet } from "@/lib/pgr-postgres-operations";
import { assignPcmsoAction, changePcmsoAction, changePcmsoPgrLinkAction, type PcmsoFormState } from "./pcmso-actions";

type Coordinator = { userId: string; displayName: string };
function Messages({ state }: { state: PcmsoFormState }) {
  return <>{state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}{state.success && <p className="client-form-message client-form-success" role="status">{state.success}</p>}</>;
}
function AssignmentForm({ companies, coordinators }: { companies: ClientCompany[]; coordinators: Coordinator[] }) {
  const [state, action, pending] = useActionState(assignPcmsoAction, {});
  if (!coordinators.length) return <p className="permission-note">Nenhum coordenador médico fictício está disponível nesta consultoria.</p>;
  if (!companies.some(c => c.status === "active")) return <p className="permission-note">Cadastre uma empresa e unidade ativas antes de vincular o coordenador.</p>;
  return <form action={action} className="pgr-form">
    <div className="form-field"><label htmlFor="pcmso-unit">Empresa e unidade do PCMSO</label><select id="pcmso-unit" name="companyUnit" required defaultValue=""><option value="" disabled>Selecione</option>{companies.filter(c => c.status === "active").flatMap(c => c.units.map(u => <option key={u.id} value={`${c.id}|${u.id}`}>{c.tradeName || c.legalName} · {u.name}</option>))}</select></div>
    <div className="form-field"><label htmlFor="pcmso-coordinator">Coordenador médico fictício</label><select id="pcmso-coordinator" name="coordinatorId" required defaultValue=""><option value="" disabled>Selecione</option>{coordinators.map(c => <option key={c.userId} value={c.userId}>{c.displayName}</option>)}</select></div>
    <Messages state={state}/><div className="pgr-form-footer"><p>O vínculo libera o conteúdo somente para o coordenador selecionado. A habilitação real exige verificação própria.</p><button className="primary-button" disabled={pending}>{pending ? "Vinculando…" : "Vincular coordenador"}</button></div>
  </form>;
}
function DocumentForm({ record }: { record: PcmsoRecord }) {
  const [state, action, pending] = useActionState(changePcmsoAction, {});
  const [dirty, setDirty] = useState(false);
  return <form action={action} className="pgr-form">
    <input type="hidden" name="recordId" value={record.id}/><input type="hidden" name="version" value={record.version}/>
    {record.status === "draft" && <div className="form-field pgr-wide"><label htmlFor={`pcmso-content-${record.id}`}>Conteúdo documental fictício</label><textarea id={`pcmso-content-${record.id}`} name="content" maxLength={12000} defaultValue={record.content} onChange={event => setDirty(event.target.value !== record.content)} rows={7} placeholder="Use somente texto fictício, sem dados individuais de saúde."/></div>}
    <Messages state={state}/>{dirty && <p className="permission-note">Salve suas alterações antes de enviar para revisão.</p>}<div className="pcmso-buttons">
      {record.status === "draft" && <><button className="primary-button" name="operation" value="save" disabled={pending}>Salvar versão do PCMSO</button>{record.version > 0 && <button className="secondary-button" name="operation" value="submit" disabled={pending || dirty}>Enviar PCMSO para revisão</button>}</>}
      {record.status === "in_review" && <button className="primary-button" name="operation" value="review" disabled={pending}>Registrar revisão interna do PCMSO</button>}
    </div>
  </form>;
}
function PgrRiskLinkForm({ record, options }: { record: PcmsoRecord; options: PgrRiskOptionSet[] }) {
  const [state, action, pending] = useActionState(changePcmsoPgrLinkAction, {});
  const [inventoryId, setInventoryId] = useState(record.pgrRiskLink?.inventoryId ?? options[0]?.inventoryId ?? "");
  const selected = options.find(option => option.inventoryId === inventoryId);
  if (!selected) return null;
  const selectedIds = new Set(record.pgrRiskLink?.inventoryId === selected.inventoryId ? record.pgrRiskLink.riskItemIds : []);
  return <form action={action} className="pgr-form pcmso-risk-link-form">
    <input type="hidden" name="recordId" value={record.id}/>
    <input type="hidden" name="linkVersion" value={record.pgrRiskLink?.version ?? 0}/>
    {options.length > 1 ? <div className="form-field pgr-wide"><label htmlFor={`pcmso-pgr-${record.id}`}>Inventário PGR aprovado</label><select id={`pcmso-pgr-${record.id}`} value={selected.inventoryId} onChange={event => setInventoryId(event.target.value)}>{options.map(option => <option key={option.inventoryId} value={option.inventoryId}>{option.title} · revisão {option.inventoryRevision}</option>)}</select></div> : <input type="hidden" name="inventoryId" value={selected.inventoryId}/>}
    {options.length > 1 && <input type="hidden" name="inventoryId" value={selected.inventoryId}/>}
    <div className="form-field pgr-wide"><span className="form-label">Referências do PGR aprovado · revisão {selected.inventoryRevision}</span>
      <div className="pcmso-risk-checkboxes" key={selected.inventoryId}>{selected.risks.map(risk => <label key={risk.id}>
        <input type="checkbox" name="riskItemId" value={risk.id} defaultChecked={selectedIds.has(risk.id)}/>
        <span><strong>{risk.hazard || "Perigo ainda não descrito"}</strong><small>{[risk.process, risk.activity].filter(Boolean).join(" · ")}</small></span>
      </label>)}</div>
    </div>
    <Messages state={state}/>
    <div className="pgr-form-footer"><p>{record.pgrRiskLink ? `Vínculo ${record.pgrRiskLink.status === "reviewed" ? "revisado" : "pendente"} · versão ${record.pgrRiskLink.version} · ${record.pgrRiskLink.riskItemIds.length} riscos` : "Nenhum risco foi vinculado ainda."} A seleção não gera exames automaticamente.</p>
      <div className="pcmso-buttons"><button className="secondary-button" name="operation" value="save" disabled={pending || record.status === "reviewed" || !selected.risks.length}>Salvar referências</button>
        {record.pgrRiskLink?.status === "pending" && <button className="primary-button" name="operation" value="review" disabled={pending || record.status === "reviewed"}>Revisar vínculo</button>}</div>
    </div>
  </form>;
}
const statuses = { draft: "Rascunho", in_review: "Em revisão", reviewed: "Revisão interna registrada" } as const;
const actions: Record<string, string> = { assigned: "Coordenador vinculado", save: "Versão salva", submit: "Enviado para revisão", review: "Revisão interna registrada" };
function date(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)); }

function isFullRecord(record: PcmsoSummary | PcmsoRecord): record is PcmsoRecord { return "content" in record && "revisions" in record && "history" in record; }

export default function PcmsoSection({ summaries, records, companies, coordinators, canAssign, isMedical, pcmsoStorageMode = "json", pgrRiskOptions = [], pgrRiskError }: { summaries: PcmsoSummary[]; records: PcmsoRecord[]; companies: ClientCompany[]; coordinators: Coordinator[]; canAssign: boolean; isMedical: boolean; pcmsoStorageMode?: "json" | "postgres"; pgrRiskOptions?: PgrRiskOptionSet[]; pgrRiskError?: string }) {
  return <section className="panel pgr-section pcmso-section" aria-labelledby="pcmso-heading">
    <div className="panel-heading"><div><h2 id="pcmso-heading">PCMSO · responsabilidade médica</h2><p>Programa de Controle Médico de Saúde Ocupacional</p></div><span className="period-label">Demonstração local</span></div>
    <div className="document-warning"><strong>Somente dados fictícios.</strong> A revisão interna não é assinatura, validação profissional ou declaração de conformidade. Não registre diagnósticos, exames, aptidão ou dados individuais de saúde.</div>
    {canAssign && <AssignmentForm companies={companies} coordinators={coordinators}/>}
    {!isMedical && <p className="permission-note">Seu perfil acompanha apenas o andamento administrativo. O conteúdo e seu histórico de versões são exclusivos do coordenador médico vinculado.</p>}
    <div className="pgr-records"><h3>{isMedical ? "PCMSOs sob sua responsabilidade" : "Andamento dos PCMSOs"}</h3>
      {(isMedical ? records : summaries).length === 0 && <p className="client-empty">{isMedical ? "Nenhum PCMSO está vinculado a você. Solicite o vínculo à administradora." : "Nenhum coordenador foi vinculado a uma unidade."}</p>}
      {(isMedical ? records : summaries).map(record => <article className="pgr-card" key={record.id}>
        <header><div><h4>PCMSO · {record.companyName}</h4><p>{record.unitName} · versão {record.version} · atualizado em {date(record.updatedAt)} (Brasília)</p></div><span className="period-label">{statuses[record.status]}</span></header>
        <p>Responsável: coordenador médico fictício vinculado.</p>
        {isMedical && <section className="pgr-medical-risk-context" aria-label="Riscos do PGR para esta unidade">
          <h5>Riscos identificados no PGR aprovado</h5>
          {pgrRiskError ? <p className="permission-note" role="status">{pgrRiskError}</p> : (() => {
            const optionSets = pgrRiskOptions.filter(option => option.companyId === record.companyId && option.unitId === record.unitId);
            return optionSets.length ? <>
              {optionSets.map(option => <div className="pgr-risk-source" key={option.inventoryId}>
                <p>{option.title} · revisão {option.inventoryRevision}</p>
                {option.risks.length ? <ul>{option.risks.map(risk => <li key={risk.id}>
                  <strong>{risk.hazard || "Perigo ainda não descrito"}</strong>
                  <span>{[risk.process, risk.activity].filter(Boolean).join(" · ")}</span>
                  {risk.possibleHarm && <span>Dano possível: {risk.possibleHarm}</span>}
                  {risk.exposureDescription && <span>Exposição: {risk.exposureDescription}</span>}
                  <small>Referência do risco: {risk.id}</small>
                </li>)}</ul> : <p className="permission-note">O inventário aprovado ainda não contém itens estruturados de risco.</p>}
              </div>)}
              <p className="permission-note">Referências para avaliação médica. Nenhum exame é sugerido automaticamente.</p>
              {isMedical && pcmsoStorageMode === "postgres" && isFullRecord(record) && record.status !== "reviewed" && <PgrRiskLinkForm record={record} options={optionSets}/>}
              {record.pgrRiskLink && <p className="permission-note">Vínculo salvo na revisão {record.pgrRiskLink.inventoryRevision}: {record.pgrRiskLink.riskItemIds.length} riscos · {record.pgrRiskLink.status === "reviewed" ? "revisão interna registrada" : "aguardando revisão médica"}.</p>}
            </> : <p className="permission-note">Não há inventário aprovado para esta unidade. Solicite a revisão do PGR antes de definir referências no PCMSO.</p>;
          })()}
        </section>}
        {isMedical && isFullRecord(record) && <>
          {record.status !== "draft" && <div className="pgr-content"><h5>Conteúdo da versão {record.version}</h5><p>{record.content}</p></div>}
          {record.status !== "reviewed" ? <DocumentForm key={`${record.id}-${record.version}-${record.status}`} record={record}/> : <p className="pgr-review-note">Revisão interna registrada pelo coordenador. Conteúdo bloqueado para edição; não representa assinatura.</p>}
          <details className="document-versions"><summary>Versões preservadas · {record.revisions.length}</summary><ul>{record.revisions.map(r => <li key={r.version}><details><summary>Versão {r.version} · {date(r.savedAt)} (Brasília)</summary><div className="pgr-content"><p>{r.content}</p></div><small>Autor: coordenador médico fictício</small></details></li>)}</ul></details>
          <details className="document-versions"><summary>Histórico · {record.history.length} eventos</summary><ul>{record.history.map((h, i) => <li key={i}>{actions[h.action] ?? h.action} · {date(h.occurredAt)} (Brasília)</li>)}</ul></details>
        </>}
      </article>)}
    </div>
  </section>;
}
