"use client";
import Link from "next/link";
import { Icon } from "@/components/sst-icon";
import { useActionState } from "react";
import type { ClientCompany } from "@/lib/client-store";
import type { AccidentFormInput, AccidentRecord } from "@/lib/accident-store";
import { ACCIDENT_STATUS_LABEL, ACCIDENT_TYPE_LABEL, CAT_TYPE_LABEL, TRANSMISSION_CHANNEL_LABEL, formatDateBR } from "@/lib/accident-labels";
import { markCatReadyAction, registerTransmissionAction, reportAccidentAction, updateAccidentAction, type AccidentFormState } from "./actions";

export type AccidentView = AccidentRecord & { scopeLabel: string; pending: { key: string; label: string }[] };

function Feedback({ state }: { state: AccidentFormState }) {
  return <>{state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}{state.success && <p className="client-form-message client-form-success" role="status">{state.success}</p>}</>;
}

function scopeValue(defaults?: Partial<AccidentFormInput>) {
  return defaults?.companyId && defaults?.unitId ? `${defaults.companyId}|${defaults.unitId}` : "";
}

function Fields({ companies, defaults, canSeeSensitive }: { companies: ClientCompany[]; defaults?: Partial<AccidentFormInput>; canSeeSensitive: boolean }) {
  const options = companies.filter((item) => item.status === "active").flatMap((item) => item.units.map((unit) => ({
    value: `${item.id}|${unit.id}`,
    label: `${item.tradeName || item.legalName} · ${unit.name}`,
  })));
  return <>
    <label className="form-field pgr-wide">Empresa e unidade<select name="scope" required defaultValue={scopeValue(defaults)}><option value="" disabled>Selecione</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    <label className="form-field">Trabalhador<input name="workerName" required maxLength={120} defaultValue={defaults?.workerName ?? ""}/></label>
    <label className="form-field">CPF ou matrícula (opcional)<input name="workerDocument" maxLength={20} defaultValue={defaults?.workerDocument ?? ""}/></label>
    <label className="form-field">Função (opcional)<input name="workerRole" maxLength={120} defaultValue={defaults?.workerRole ?? ""}/></label>
    <label className="form-field">Tipo de acidente<select name="type" required defaultValue={defaults?.type ?? ""}><option value="" disabled>Selecione</option><option value="typical">Acidente típico</option><option value="commute">Acidente de trajeto</option><option value="disease">Doença relacionada ao trabalho</option></select></label>
    <label className="form-field">Data do acidente<input type="date" name="occurredOn" required defaultValue={defaults?.occurredOn ?? ""}/></label>
    <label className="form-field">Hora (opcional)<input name="occurredAtTime" placeholder="HH:MM" maxLength={5} defaultValue={defaults?.occurredAtTime ?? ""}/></label>
    <label className="form-field">Tipo de CAT<select name="catType" required defaultValue={defaults?.catType ?? "initial"}><option value="initial">Inicial</option><option value="reopen">Reabertura</option><option value="death">Comunicação de óbito</option></select></label>
    <label className="form-field">Número da CAT de origem (reabertura)<input name="previousCatNumber" maxLength={60} defaultValue={defaults?.previousCatNumber ?? ""}/></label>
    <label className="form-field pgr-wide">Local do acidente<input name="location" required maxLength={200} defaultValue={defaults?.location ?? ""}/></label>
    <label className="form-field pgr-wide">Descrição do ocorrido<textarea name="description" required rows={4} maxLength={4000} defaultValue={defaults?.description ?? ""}/></label>
    <label className="form-field">Houve afastamento?<select name="hadLeave" defaultValue={defaults?.hadLeave ? "yes" : "no"}><option value="no">Não</option><option value="yes">Sim</option></select></label>
    <label className="form-field">Último dia trabalhado (opcional)<input type="date" name="lastWorkDay" defaultValue={defaults?.lastWorkDay ?? ""}/></label>
    <label className="form-field">Houve óbito?<select name="death" defaultValue={defaults?.death ? "yes" : "no"}><option value="no">Não</option><option value="yes">Sim</option></select></label>
    <label className="form-field">Data do óbito<input type="date" name="deathDate" defaultValue={defaults?.deathDate ?? ""}/></label>
    <fieldset className="pgr-wide"><legend>Dados do atestado médico</legend>
      <label className="form-field">Médico<input name="doctorName" maxLength={120} defaultValue={defaults?.doctorName ?? ""}/></label>
      <label className="form-field">CRM<input name="crm" maxLength={30} defaultValue={defaults?.crm ?? ""}/></label>
      <label className="form-field">UF do CRM<input name="crmUf" maxLength={2} placeholder="SP" defaultValue={defaults?.crmUf ?? ""}/></label>
      <label className="form-field">Data do atendimento<input type="date" name="attendedOn" defaultValue={defaults?.attendedOn ?? ""}/></label>
      <label className="form-field">Dias de afastamento<input name="daysOff" inputMode="numeric" maxLength={4} defaultValue={defaults?.daysOff ?? ""}/></label>
      {canSeeSensitive
        ? <label className="form-field">CID<input name="cid" maxLength={10} placeholder="A00.0" defaultValue={defaults?.cid ?? ""}/><small>Dado sensível de saúde: visível apenas para médico do trabalho, TST responsável e administração.</small></label>
        : <p className="permission-note pgr-wide">O CID só pode ser informado e visto por médico do trabalho, TST responsável e administração. Seu perfil registra o acidente e informa CRM, data e dias de afastamento.</p>}
    </fieldset>
  </>;
}

function NewAccident({ companies, canSeeSensitive }: { companies: ClientCompany[]; canSeeSensitive: boolean }) {
  const [state, action, pending] = useActionState(reportAccidentAction, {});
  if (!companies.length) return <div className="document-warning">Nenhuma empresa ativa disponível para este acesso. O acidente precisa de uma unidade para gerar a CAT.</div>;
  return <details className="aso-new" open><summary><span className="icon-inline" aria-hidden="true"><Icon name="warning" size={18}/></span>Registrar acidente</summary>
    <form action={action} className="pgr-form">
      <Fields companies={companies} canSeeSensitive={canSeeSensitive}/>
      <Feedback state={state}/>
      <div className="pgr-form-footer"><p>Registre fatos. O sistema não classifica gravidade, não valida nexo e não transmite a CAT.</p>
        <button className="primary-button" disabled={pending}><span className="icon-inline" aria-hidden="true"><Icon name="check" size={18}/></span>{pending ? "Salvando…" : "Registrar acidente"}</button>
      </div>
    </form>
  </details>;
}

function Edit({ item, companies, canSeeSensitive }: { item: AccidentView; companies: ClientCompany[]; canSeeSensitive: boolean }) {
  const [state, action, pending] = useActionState(updateAccidentAction, {});
  return <form action={action} className="pgr-form"><input type="hidden" name="id" value={item.id}/>
    <Fields companies={companies} canSeeSensitive={canSeeSensitive} defaults={{
      companyId: item.companyId, unitId: item.unitId, workerName: item.workerName, workerDocument: item.workerDocument,
      workerRole: item.workerRole, occurredOn: item.occurredOn, occurredAtTime: item.occurredAtTime, type: item.type,
      catType: item.catType, previousCatNumber: item.previousCatNumber, location: item.location, description: item.description,
      lastWorkDay: item.lastWorkDay, hadLeave: item.hadLeave, death: item.death, deathDate: item.deathDate,
      doctorName: item.medical?.doctorName, crm: item.medical?.crm, crmUf: item.medical?.crmUf,
      attendedOn: item.medical?.attendedOn, cid: item.medical?.cid, daysOff: item.medical?.daysOff === undefined ? "" : String(item.medical.daysOff),
    }}/>
    <Feedback state={state}/>
    <div className="pgr-form-footer"><p>Salvar correções devolve o registro para rascunho e reabre a conferência.</p><button className="secondary-button" disabled={pending}>{pending ? "Salvando…" : "Salvar correções"}</button></div>
  </form>;
}

function Ready({ item }: { item: AccidentView }) {
  const [state, action, pending] = useActionState(markCatReadyAction, {});
  return <form action={action} className="pgr-form"><input type="hidden" name="id" value={item.id}/>
    <Feedback state={state}/>
    <div className="pgr-form-footer"><p>Marcar como pronta confere os dados; a transmissão é do cliente no eSocial ou CATWeb.</p><button className="secondary-button" disabled={pending}>{pending ? "Conferindo…" : "Marcar CAT pronta"}</button></div>
  </form>;
}

function Transmit({ item }: { item: AccidentView }) {
  const [state, action, pending] = useActionState(registerTransmissionAction, {});
  return <form action={action} className="pgr-form"><input type="hidden" name="id" value={item.id}/>
    <label className="form-field">Canal usado<select name="channel" defaultValue="esocial"><option value="esocial">eSocial (S-2210)</option><option value="catweb">CATWeb</option><option value="other">Outro canal</option></select></label>
    <label className="form-field">Número da CAT / recibo<input name="number" required maxLength={60}/></label>
    <Feedback state={state}/>
    <div className="pgr-form-footer"><p>O sistema apenas guarda o número informado; ele não transmite nada.</p><button className="secondary-button" disabled={pending}>{pending ? "Salvando…" : "Registrar transmissão"}</button></div>
  </form>;
}

function historyLabel(entry: AccidentView["history"][number]) {
  if (entry.action === "reported") return "Acidente registrado";
  if (entry.action === "updated") return "Dados revisados";
  if (entry.action === "cat_ready") return "CAT conferida e pronta";
  return "Transmissão registrada";
}

export default function AccidentSection({ companies, items, canManage, canSeeSensitive }: { companies: ClientCompany[]; items: AccidentView[]; canManage: boolean; canSeeSensitive: boolean }) {
  return <section className="panel pgr-section" aria-label="Acidentes e CAT">
    <div className="document-warning">Use somente dados fictícios. Este módulo monta a CAT; não transmite ao eSocial nem ao CATWeb, não valida nexo causal e não substitui a obrigação legal da empresa. Armazenamento local de demonstração, sem criptografia.</div>
    <NewAccident companies={companies} canSeeSensitive={canSeeSensitive}/>
    <h2><span className="icon-inline" aria-hidden="true"><Icon name="history" size={18}/></span>{canManage ? "Acidentes registrados" : "Meus registros"}</h2>
    {items.length ? items.map((item) => <article className="pgr-card" key={item.id}>
      <header><div><h3>{item.protocol} · {ACCIDENT_TYPE_LABEL[item.type]}</h3>
        <p>{ACCIDENT_STATUS_LABEL[item.status]} · {CAT_TYPE_LABEL[item.catType]} · {formatDateBR(item.occurredOn)}{item.occurredAtTime ? ` ${item.occurredAtTime}` : ""}{item.scopeLabel ? ` · ${item.scopeLabel}` : ""}</p></div></header>
      <p><strong>{item.workerName}</strong>{item.workerDocument ? ` · ${item.workerDocument}` : ""}{item.workerRole ? ` · ${item.workerRole}` : ""} — {item.location}</p>
      <p>{item.description}</p>
      <p>Afastamento: {item.hadLeave ? "sim" : "não"}{item.lastWorkDay ? ` · último dia trabalhado ${formatDateBR(item.lastWorkDay)}` : ""}{item.death ? ` · óbito${item.deathDate ? ` em ${formatDateBR(item.deathDate)}` : ""}` : ""}</p>
      {item.catType === "reopen" && item.previousCatNumber && <p>CAT de origem: {item.previousCatNumber}</p>}
      {item.transmission && <p>Transmissão: {TRANSMISSION_CHANNEL_LABEL[item.transmission.channel]} · número {item.transmission.number} · registrada em {new Date(item.transmission.registeredAt).toLocaleString("pt-BR")}</p>}
      {item.pending.length > 0 && <div className="permission-note"><strong>Pendências:</strong><ul>{item.pending.map((entry) => <li key={entry.key}>{entry.label}</li>)}</ul></div>}
      <p><Link href={`/acidentes/${encodeURIComponent(item.id)}`} target="_blank" rel="noreferrer"><span className="icon-inline" aria-hidden="true"><Icon name="clipboard" size={15}/></span>Ver CAT — dados para transmissão</Link></p>
      <details><summary>Histórico</summary><ul>{item.history.map((entry, index) => <li key={index}>{new Date(entry.occurredAt).toLocaleString("pt-BR")} · {historyLabel(entry)}{entry.note ? ` · ${entry.note}` : ""}</li>)}</ul></details>
      {canManage && item.status !== "transmitted" && <details><summary>Corrigir ou completar dados</summary><Edit item={item} companies={companies} canSeeSensitive={canSeeSensitive}/></details>}
      {canManage && item.status === "draft" && <details><summary>Conferir e marcar CAT pronta</summary><Ready item={item}/></details>}
      {canManage && item.status === "ready" && <details><summary>Registrar número da CAT transmitida</summary><Transmit item={item}/></details>}
    </article>) : <div className="client-empty"><span className="client-empty-icon" aria-hidden="true"><Icon name="warning" size={22}/></span><h3>Nenhum acidente registrado</h3><p>O primeiro registro aparece aqui com protocolo, pendências da CAT e documento para transmissão.</p></div>}
  </section>;
}
