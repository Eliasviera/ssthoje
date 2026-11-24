"use client";

import { useActionState, useState } from "react";
import type { AsoRecord, AsoSummary, AsoWorker, AsoContent } from "@/lib/aso-store";
import { changeAsoAction } from "./aso-actions";

const statuses = { draft: "Rascunho", in_review: "Em revisão", reviewed: "Revisão interna registrada" } as const;
const fitnessLabels = { unrecorded: "Não registrada", fit: "Apto — informado pelo médico", unfit: "Inapto — informado pelo médico" } as const;
function date(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)); }
function day(value: string) { return value.split("-").reverse().join("/"); }
function Content({ content }: { content: AsoContent }) {
  return <div className="pgr-content aso-content"><dl><dt>Referência fictícia</dt><dd>{content.reference}</dd><dt>Atendimento informado</dt><dd>{day(content.appointmentDate)}</dd><dt>Prazo do próximo exame</dt><dd>{content.nextExamDueOn ? day(content.nextExamDueOn) : "Não informado"}</dd><dt>Aptidão informada pelo médico</dt><dd>{fitnessLabels[content.fitness]}</dd></dl><h5>Exames informados · sem resultados clínicos</h5>{content.exams.length ? <ul>{content.exams.map((e, i) => <li key={i}>{e.name} · {day(e.date)}</li>)}</ul> : <p>Nenhum exame informado neste registro.</p>}</div>;
}
function AsoForm({ workers, record }: { workers: AsoWorker[]; record?: AsoRecord }) {
  const [state, action, pending] = useActionState(changeAsoAction, {});
  const [dirty, setDirty] = useState(false);
  const [fields, setFields] = useState({ workerId: record?.workerId ?? "", reference: record?.content.reference ?? "", appointmentDate: record?.content.appointmentDate ?? "", fitness: record?.content.fitness ?? "unrecorded" });
  const [exams, setExams] = useState(record?.content.exams.length ? record.content.exams : [{ name: "", date: "" }]);
  const [nextExamDueOn, setNextExamDueOn] = useState(record?.content.nextExamDueOn ?? "");
  const suffix = record?.id ?? "new";
  const editing = !record || record.status === "draft";
  return <form action={action} className="pgr-form aso-form" onReset={event => event.preventDefault()} onChange={() => setDirty(true)}>
    <input type="hidden" name="version" value={record?.version ?? 0}/>{record && <><input type="hidden" name="recordId" value={record.id}/><input type="hidden" name="workerId" value={record.workerId}/></>}
    {editing && <>
      {!record && <div className="form-field pgr-wide"><label htmlFor={`aso-worker-${suffix}`}>Trabalhador fictício</label><select id={`aso-worker-${suffix}`} name="workerId" required value={fields.workerId} onChange={e => setFields({ ...fields, workerId: e.target.value })}><option value="" disabled>Selecione</option>{workers.map(w => <option key={w.workerId} value={w.workerId}>{w.workerName} · {w.jobTitle} · {w.unitName}</option>)}</select></div>}
      <div className="form-field"><label htmlFor={`aso-reference-${suffix}`}>Referência fictícia do ASO</label><input id={`aso-reference-${suffix}`} name="reference" required maxLength={100} value={fields.reference} onChange={e => setFields({ ...fields, reference: e.target.value })} placeholder="ASO fictício — teste M10"/></div>
      <div className="form-field"><label htmlFor={`aso-date-${suffix}`}>Data informada do atendimento</label><input id={`aso-date-${suffix}`} name="appointmentDate" type="date" required value={fields.appointmentDate} onChange={e => setFields({ ...fields, appointmentDate: e.target.value })}/></div>
      <div className="form-field"><label htmlFor={`aso-due-${suffix}`}>Prazo do próximo exame (opcional)</label><input id={`aso-due-${suffix}`} name="nextExamDueOn" type="date" min={fields.appointmentDate || undefined} value={nextExamDueOn} onChange={e => setNextExamDueOn(e.target.value)}/></div>
      <div className="form-field pgr-wide"><label htmlFor={`aso-fitness-${suffix}`}>Aptidão fictícia informada pelo médico</label><select id={`aso-fitness-${suffix}`} name="fitness" value={fields.fitness} onChange={e => setFields({ ...fields, fitness: e.target.value as AsoContent["fitness"] })}>{Object.entries(fitnessLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><p className="aso-help">O sistema não calcula aptidão nem libera o trabalhador. A seleção é exclusivamente humana nesta demonstração.</p></div>
      <fieldset className="aso-exams pgr-wide"><legend>Exames fictícios informados · opcionais, sem resultados</legend>{exams.map((exam, i) => <div className="aso-exam-row" key={i}>
        <div className="form-field"><label htmlFor={`aso-exam-name-${suffix}-${i}`}>Nome do exame {i + 1}</label><input id={`aso-exam-name-${suffix}-${i}`} name="examName" value={exam.name} maxLength={120} onChange={e => setExams(exams.map((item, index) => index === i ? { ...item, name: e.target.value } : item))}/></div>
        <div className="form-field"><label htmlFor={`aso-exam-date-${suffix}-${i}`}>Data do exame {i + 1}</label><input id={`aso-exam-date-${suffix}-${i}`} name="examDate" type="date" value={exam.date} onChange={e => setExams(exams.map((item, index) => index === i ? { ...item, date: e.target.value } : item))}/></div>
        <button className="secondary-button" type="button" aria-label={`Remover exame ${i + 1}`} disabled={pending} onClick={() => { setExams(exams.filter((_, index) => index !== i)); setDirty(true); }}>Remover</button>
      </div>)}<button className="secondary-button" type="button" disabled={pending || exams.length >= 10} onClick={() => { setExams([...exams, { name: "", date: "" }]); setDirty(true); }}>Adicionar exame fictício</button></fieldset>
    </>}
    {state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}{state.success && <p className="client-form-message client-form-success" role="status">{state.success}</p>}
    {dirty && record && <p className="aso-help">Salve as alterações antes de enviar para revisão.</p>}
    <div className="pcmso-buttons">{editing && <button className="primary-button" name="operation" value="save" disabled={pending}>Salvar versão do ASO</button>}
      {record?.status === "draft" && <button className="secondary-button" name="operation" value="submit" disabled={pending || dirty}>Enviar ASO para revisão</button>}
      {record?.status === "in_review" && <button className="primary-button" name="operation" value="review" disabled={pending}>Registrar revisão interna do ASO</button>}
    </div>
  </form>;
}
function MedicalCard({ record, workers }: { record: AsoRecord; workers: AsoWorker[] }) {
  return <article className="pgr-card"><header><div><h4>ASO · {record.workerName}</h4><p>{record.jobTitle} · {record.companyName} · {record.unitName}</p><p>Versão {record.version} · atualização {date(record.updatedAt)} (Brasília)</p></div><span className="period-label">{statuses[record.status]}</span></header>
    {record.status === "draft" ? <AsoForm key={`${record.id}-${record.version}`} record={record} workers={workers}/> : <><Content content={record.content}/>{record.status === "in_review" ? <AsoForm key={`${record.id}-${record.status}`} record={record} workers={workers}/> : <p className="pgr-review-note">Revisão interna registrada pelo médico. Edição bloqueada; não representa assinatura ou liberação do trabalhador.</p>}</>}
    <details className="document-versions"><summary>Versões preservadas do ASO · {record.revisions.length}</summary>{record.revisions.map(r => <details className="aso-revision" key={r.version}><summary>Versão {r.version} · {date(r.savedAt)} (Brasília)</summary><Content content={r.content}/><small>Autor: médico fictício · {r.actorUserId}</small></details>)}</details>
    <details className="document-versions"><summary>Histórico do ASO · {record.history.length} eventos</summary><ul>{record.history.map((h, i) => <li key={i}>{{ save: "Versão salva", submit: "Enviado para revisão", review: "Revisão interna registrada" }[h.action]} · {date(h.occurredAt)} (Brasília)</li>)}</ul></details>
  </article>;
}
export default function AsoSection({ records, summaries, workers, isMedical, onOpenPcmso, onOpenWorkers }: { records: AsoRecord[]; summaries: AsoSummary[]; workers: AsoWorker[]; isMedical: boolean; onOpenPcmso?: () => void; onOpenWorkers?: () => void }) {
  return <section className="panel pgr-section pcmso-section aso-section" aria-labelledby="aso-heading">
    <div className="panel-heading"><div><h2 id="aso-heading">ASO · exames e aptidão</h2><p>Atestado de Saúde Ocupacional · registro fictício</p></div><span className="period-label">Demonstração local</span></div>
    <div className="document-warning"><strong>Somente dados fictícios.</strong> Não inclua diagnósticos, resultados clínicos ou dados reais. A revisão registrada não gera ASO oficial, assinatura ou liberação automática para o trabalho.</div>
    {isMedical ? <>
      <details className="aso-new" key={`new-${records.length}`} open={records.length === 0}><summary>Novo registro fictício</summary>{workers.length ? <AsoForm workers={workers}/> : <div className="permission-note"><p>Nenhum trabalhador ativo está disponível nas unidades vinculadas a você. Solicite à administradora o cadastro e o vínculo médico.</p>{onOpenPcmso && <button className="secondary-button" onClick={onOpenPcmso}>Consultar meus vínculos no PCMSO</button>}</div>}</details>
      <div className="pgr-records"><h3>ASOs das unidades sob sua responsabilidade</h3>{records.length ? records.map(r => <MedicalCard key={r.id} record={r} workers={workers}/>) : <p className="client-empty">Nenhum ASO fictício registrado.</p>}</div>
    </> : <>
      <div className="permission-note"><p>Seu perfil recebe apenas o andamento administrativo. Aptidão, exames, atendimento, referência do ASO e versões de conteúdo são exclusivos do médico vinculado.</p><div className="pcmso-buttons">{onOpenWorkers && <button className="secondary-button" onClick={onOpenWorkers}>Consultar trabalhadores</button>}{onOpenPcmso && <button className="secondary-button" onClick={onOpenPcmso}>Vínculos médicos no PCMSO</button>}</div></div>
      <div className="pgr-records"><h3>Andamento dos ASOs</h3>{summaries.length ? summaries.map(r => <article className="pgr-card" key={r.id}><header><div><h4>ASO · {r.workerName}</h4><p>{r.jobTitle} · {r.companyName} · {r.unitName}</p><p>Versão {r.version} · atualização {date(r.updatedAt)} (Brasília)</p></div><span className="period-label">{statuses[r.status]}</span></header></article>) : <p className="client-empty">Nenhum ASO fictício registrado nesta consultoria. Cadastre trabalhadores e vincule o médico no PCMSO para iniciar.</p>}</div>
    </>}
  </section>;
}
