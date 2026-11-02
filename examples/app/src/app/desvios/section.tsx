"use client";
import { useActionState } from "react";
import type { ClientCompany } from "@/lib/client-store";
import type { DeviationRecord } from "@/lib/deviation-store";
import { reportDeviationAction, transitionDeviationAction, type DeviationFormState } from "./actions";

type DeviationView = DeviationRecord & { scopeLabel: string };
const kindLabel = { deviation: "Desvio", near_miss: "Quase incidente" } as const;
const statusLabel = { open: "Aberto", in_review: "Em tratamento", closed: "Encerrado" } as const;

function Feedback({ state }: { state: DeviationFormState }) {
  return <>{state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}{state.success && <p className="client-form-message client-form-success" role="status">{state.success}</p>}</>;
}

function Treat({ item }: { item: DeviationView }) {
  const [state, action, pending] = useActionState(transitionDeviationAction, {});
  return <form action={action} className="pgr-form"><input type="hidden" name="id" value={item.id}/>
    <label className="form-field pgr-wide">Tratativa (obrigatória para encerrar)<textarea name="note" rows={2} maxLength={1000}/></label>
    <label className="form-field">Nova situação<select name="status" defaultValue={item.status === "open" ? "in_review" : "closed"}><option value="in_review">Em tratamento</option><option value="closed">Encerrado</option></select></label>
    <Feedback state={state}/><div className="pgr-form-footer"><button className="secondary-button" disabled={pending}>{pending ? "Salvando…" : "Atualizar"}</button></div></form>;
}

function ncHref(item: DeviationView) {
  const query = new URLSearchParams({
    title: `${kindLabel[item.kind]}: ${item.description}`.slice(0, 140),
    location: item.location.slice(0, 500),
    description: item.description.slice(0, 2000),
    evidence: `Relato de ${kindLabel[item.kind].toLowerCase()} em ${item.occurredOn} por ${item.reporterName} (registro ${item.id}).`.slice(0, 2000),
  });
  if (item.companyId && item.unitId) query.set("scope", `${item.companyId}|${item.unitId}`);
  return `/nao-conformidades?${query.toString()}`;
}

export default function DeviationSection({ companies, items, canManage }: { companies: ClientCompany[]; items: DeviationView[]; canManage: boolean }) {
  const [state, action, pending] = useActionState(reportDeviationAction, {});
  return <section className="panel pgr-section" aria-label="Desvios de SST">
    <div className="document-warning">Use somente dados fictícios. O relato é uma informação declarada por quem o registrou; não classifica gravidade nem atesta conformidade. Armazenamento local de demonstração, sem criptografia.</div>
    <details className="aso-new" open><summary>Relatar desvio ou quase incidente</summary><form action={action} className="pgr-form">
      <label className="form-field">Tipo<select name="kind" required defaultValue=""><option value="" disabled>Selecione</option><option value="deviation">Desvio</option><option value="near_miss">Quase incidente (nada aconteceu, mas poderia)</option></select></label>
      <label className="form-field">Data da ocorrência<input type="date" name="occurredOn" required/></label>
      {companies.length > 0 ? <label className="form-field pgr-wide">Empresa e unidade (opcional)<select name="scope" defaultValue=""><option value="">Não sei / não se aplica</option>{companies.filter((item) => item.status === "active").flatMap((item) => item.units.map((unit) => <option key={`${item.id}|${unit.id}`} value={`${item.id}|${unit.id}`}>{item.tradeName || item.legalName} · {unit.name}</option>))}</select></label> : <input type="hidden" name="scope" value=""/>}
      <label className="form-field pgr-wide">Local<input name="location" required maxLength={200}/></label>
      <label className="form-field pgr-wide">O que aconteceu ou foi observado<textarea name="description" required rows={4} maxLength={2000}/></label>
      <label className="form-field pgr-wide">Ação imediata tomada (opcional)<textarea name="immediateAction" rows={2} maxLength={1000}/></label>
      <Feedback state={state}/>
      <div className="pgr-form-footer"><p>Descreva fatos, sem citar nomes de pessoas se não for necessário.</p><button className="secondary-button" disabled={pending}>{pending ? "Enviando…" : "Enviar relato"}</button></div></form></details>
    <h2>{canManage ? "Relatos recebidos" : "Meus relatos"}</h2>
    {items.length ? items.map((item) => <article className="pgr-card" key={item.id}><header><div><h3>{kindLabel[item.kind]} · {item.location}</h3><p>{statusLabel[item.status]} · {item.occurredOn.split("-").reverse().join("/")} · {item.reporterName}{item.scopeLabel ? ` · ${item.scopeLabel}` : ""}</p></div></header>
      <p>{item.description}</p>{item.immediateAction && <p><strong>Ação imediata:</strong> {item.immediateAction}</p>}
      <details><summary>Histórico</summary><ul>{item.history.map((entry, index) => <li key={index}>{new Date(entry.occurredAt).toLocaleString("pt-BR")} · {entry.action === "reported" ? "Relato registrado" : statusLabel[entry.status]}{entry.note ? ` · ${entry.note}` : ""}</li>)}</ul></details>
      {canManage && item.status !== "closed" && <details><summary>Tratar</summary><Treat item={item}/></details>}
      {canManage && <p><a href={ncHref(item)}>Abrir não conformidade</a></p>}</article>) : <p>Nenhum relato por enquanto.</p>}
  </section>;
}
