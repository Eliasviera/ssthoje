"use client";
import { useActionState } from "react";
import type { ClientCompany } from "@/lib/client-store";
import type { Nonconformity, NcStatus } from "@/lib/nonconformity-store";
import { createNcAction, transitionNcAction, type NcFormState } from "./actions";
const labels: Record<NcStatus, string> = {open:"Aberta", in_progress:"Em correção", in_review:"Aguardando revisão", closed:"Encerrada pela equipe"};
function Feedback({state}:{state:NcFormState}) {
  return <>{state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}{state.success && <p className="client-form-message client-form-success" role="status">{state.success}</p>}</>;
}
function RecordCard({record, company}:{record:Nonconformity; company:ClientCompany|undefined}) {
  const [state, action, pending] = useActionState(transitionNcAction, {});
  const targets: Record<NcStatus,NcStatus[]> = {open:["in_progress"],in_progress:["in_review"],in_review:["in_progress","closed"],closed:["in_progress"]};
  return <article className="pgr-card"><header><div><h3>{record.title}</h3><p>{company?.tradeName || company?.legalName || "Empresa indisponível"} · {company?.units.find(unit=>unit.id===record.unitId)?.name || "Unidade indisponível"}</p></div><span className="period-label">{labels[record.status]}</span></header>
    <p><strong>Local:</strong> {record.location}</p><p><strong>Ocorrência:</strong> {record.description}</p><p><strong>Evidência descrita:</strong> {record.evidence}</p>
    <p><strong>Plano de correção:</strong> {record.actionPlan}</p><p><strong>Responsável informado:</strong> {record.responsible} · <strong>Prazo interno:</strong> {record.dueDate.split("-").reverse().join("/")}</p>
    <details><summary>Histórico · revisão {record.revision}</summary><ol>{record.history.map((event,index)=><li key={index}><strong>{labels[event.status]}</strong> · {new Date(event.occurredAt).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})} (Brasília)<p>{event.note}</p><p>Conta que registrou: {event.actorUserId}</p></li>)}</ol></details>
    <form action={action} className="pgr-form"><input type="hidden" name="id" value={record.id}/><input type="hidden" name="revision" value={record.revision}/>
      <label className="form-field">Próxima etapa<select name="status">{targets[record.status].map(status=><option key={status} value={status}>{record.status==="closed" ? "Reabrir correção" : labels[status]}</option>)}</select></label>
      <label className="form-field pgr-wide">Ação realizada, evidência da correção ou justificativa da revisão<textarea name="note" required maxLength={2000} rows={3}/></label><Feedback state={state}/>
      <div className="pgr-form-footer"><p>O encerramento é uma declaração da equipe. Não atesta conformidade nem libera atividade.</p><button className="secondary-button" disabled={pending}>{pending?"Salvando…":"Registrar acompanhamento"}</button></div>
    </form>
  </article>;
}
export type NcPrefill = { scope: string; title: string; location: string; description: string; evidence: string };

export default function NcSection({companies,records,prefill}:{companies:ClientCompany[];records:Nonconformity[];prefill?:NcPrefill}) {
  const [state, action, pending] = useActionState(createNcAction, {});
  return <section className="panel pgr-section" aria-label="Não conformidades">
    <div className="document-warning">Use somente dados fictícios. A ocorrência e as evidências são declaradas pela equipe; o sistema não determina infração legal nem conformidade. Armazenamento local de demonstração, sem criptografia.</div>
    <details className="aso-new" open={Boolean(prefill)}><summary>Registrar não conformidade</summary><form action={action} className="pgr-form">
      {prefill && <p className="client-form-message client-form-success" role="status">Dados trazidos do checklist. Revise e informe responsável, plano de correção e prazo.</p>}
      <label className="form-field pgr-wide">Empresa e unidade<select name="scope" required defaultValue={prefill?.scope ?? ""}><option value="">Selecione</option>{companies.filter(item=>item.status==="active").flatMap(item=>item.units.map(unit=><option key={`${item.id}|${unit.id}`} value={`${item.id}|${unit.id}`}>{item.tradeName||item.legalName} · {unit.name}</option>))}</select></label>
      <label className="form-field">Título<input name="title" required maxLength={140} defaultValue={prefill?.title}/></label><label className="form-field">Local observado<input name="location" required maxLength={500} defaultValue={prefill?.location}/></label>
      <label className="form-field pgr-wide">Descrição da ocorrência<textarea name="description" required maxLength={2000} rows={3} defaultValue={prefill?.description}/></label>
      <label className="form-field pgr-wide">Descrição e referência da evidência<textarea name="evidence" required maxLength={2000} rows={3} defaultValue={prefill?.evidence}/><span>Descreva a observação e sua origem. Anexos ainda não estão disponíveis.</span></label>
      <label className="form-field pgr-wide">Plano de correção<textarea name="actionPlan" required maxLength={1200} rows={3}/></label>
      <label className="form-field">Responsável informado<input name="responsible" required maxLength={120}/></label><label className="form-field">Prazo interno<input type="date" name="dueDate" required/></label>
      <Feedback state={state}/><div className="pgr-form-footer"><p>O nome informado não equivale a identidade verificada ou assinatura.</p><button className="primary-button" disabled={pending}>{pending?"Registrando…":"Registrar ocorrência"}</button></div>
    </form></details>
    <h2>Ocorrências registradas · {records.length}</h2>{!records.length && <p className="permission-note">Nenhuma ocorrência registrada. Comece descrevendo o fato observado, sua evidência e o plano de correção.</p>}
    {records.map(record=><RecordCard key={record.id} record={record} company={companies.find(company=>company.id===record.companyId)}/>)}
  </section>;
}
