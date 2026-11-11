"use client";
import Image from "next/image";
import { Icon } from "@/components/sst-icon";
import { useActionState, useEffect, useRef, useState } from "react";
import type { ClientCompany } from "@/lib/client-store";
import type { DeviationRecord } from "@/lib/deviation-store";
import type { DeviationAiDraft } from "@/lib/deviation-ai";
import { reportDeviationAction, transitionDeviationAction, type DeviationFormState } from "./actions";

type DeviationView = DeviationRecord & { scopeLabel: string };
const kindLabel = { deviation: "Desvio", near_miss: "Quase incidente" } as const;
const statusLabel = { open: "Aberto", in_review: "Em tratamento", closed: "Encerrado" } as const;

function Feedback({ state }: { state: DeviationFormState }) {
  return <>{state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}{state.success && <p className="client-form-message client-form-success" role="status">{state.success}</p>}{state.notice && <p className="permission-note" role="status">{state.notice}</p>}</>;
}

const PHOTO_TARGET_BYTES = 430 * 1024;
function approximateBytes(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  return comma < 0 ? dataUrl.length : Math.floor((dataUrl.length - comma - 1) * 0.75);
}

// Reduz em etapas para caber no limite do servidor (450 KB) sem pedir nada ao usuário.
function resizeToJpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      const draw = (maxSide: number) => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas;
      };
      let result = draw(1280).toDataURL("image/jpeg", 0.7);
      if (approximateBytes(result) > PHOTO_TARGET_BYTES) result = draw(1280).toDataURL("image/jpeg", 0.5);
      if (approximateBytes(result) > PHOTO_TARGET_BYTES) result = draw(1024).toDataURL("image/jpeg", 0.55);
      URL.revokeObjectURL(url);
      resolve(result);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Foto inválida")); };
    img.src = url;
  });
}

function DraftPreview({ draft }: { draft: DeviationAiDraft }) {
  return <section className="panel" aria-label="Rascunho sugerido por IA">
    <h3 className="ai-draft-head"><span className="client-empty-icon" aria-hidden="true"><Icon name="spark" size={18}/></span>Rascunho sugerido · confiança {draft.confidence}</h3>
    <p className="permission-note">Sugestão simulada ({draft.model} · prompt {draft.promptVersion}). Nenhuma imagem foi analisada. Revise e complete cada campo antes de salvar; o sistema não define gravidade nem declara conformidade.</p>
    <h4><span className="icon-inline" aria-hidden="true"><Icon name="clipboard" size={16}/></span>Plano de ação sugerido</h4>
    <ol>{draft.actions.map((item, index) => <li key={index}><strong>{item.what}</strong><br/><small>{item.why} · Quem: {item.who} · Quando: {item.when} · Onde: {item.where} · Como: {item.how}</small></li>)}</ol>
    <h4><span className="icon-inline" aria-hidden="true"><Icon name="warning" size={16}/></span>O que não foi observado</h4>
    <ul>{draft.notObserved.map((item, index) => <li key={index}>{item}</li>)}</ul>
  </section>;
}

function NewReport({ companies }: { companies: ClientCompany[] }) {
  const [state, action, pending] = useActionState(reportDeviationAction, {});
  const photoField = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const [localError, setLocalError] = useState("");
  const [editState, setEditState] = useState<{ at: string; edited: boolean }>({ at: "", edited: false });
  const descriptionField = useRef<HTMLTextAreaElement>(null);
  const immediateField = useRef<HTMLTextAreaElement>(null);
  const appliedDraft = useRef("");
  const draft = state.draft;
  const edited = Boolean(draft) && editState.at === draft?.generatedAt && editState.edited;

  // Escreve o rascunho direto no campo, sem remontar: o texto revisado sobrevive a um erro de envio.
  useEffect(() => {
    const value = state.draft;
    if (!value || appliedDraft.current === value.generatedAt) return;
    appliedDraft.current = value.generatedAt;
    if (descriptionField.current) descriptionField.current.value = value.description;
    if (immediateField.current) immediateField.current.value = value.immediateAction;
  }, [state.draft]);

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setLocalError(""); setPreview(""); setEditState({ at: "", edited: false });
    if (photoField.current) photoField.current.value = "";
    if (!file) return;
    try {
      const dataUrl = await resizeToJpeg(file);
      if (photoField.current) photoField.current.value = dataUrl;
      setPreview(dataUrl);
    } catch {
      setLocalError("Não foi possível ler a foto. Tente novamente.");
    }
  }

  const markEdited = () => setEditState({ at: draft?.generatedAt ?? "", edited: true });

  return <details className="aso-new" open><summary><span className="icon-inline" aria-hidden="true"><Icon name="warning" size={18}/></span>Relatar desvio ou quase incidente</summary>
    <form action={action} className="pgr-form">
      <input type="hidden" name="photo" ref={photoField}/>
      <input type="hidden" name="aiDraft" value={draft ? JSON.stringify(draft) : ""} readOnly/>
      <input type="hidden" name="aiEdited" value={edited ? "1" : "0"} readOnly/>
      <label className="form-field">Tipo<select name="kind" required defaultValue=""><option value="" disabled>Selecione</option><option value="deviation">Desvio</option><option value="near_miss">Quase incidente (nada aconteceu, mas poderia)</option></select></label>
      <label className="form-field">Data da ocorrência<input type="date" name="occurredOn" required/></label>
      {companies.length > 0 ? <label className="form-field pgr-wide">Empresa e unidade (opcional)<select name="scope" defaultValue=""><option value="">Não sei / não se aplica</option>{companies.filter((item) => item.status === "active").flatMap((item) => item.units.map((unit) => <option key={`${item.id}|${unit.id}`} value={`${item.id}|${unit.id}`}>{item.tradeName || item.legalName} · {unit.name}</option>))}</select></label> : <input type="hidden" name="scope" value=""/>}
      <label className="form-field pgr-wide">Local<input name="location" required maxLength={200}/></label>
      <label className="form-field pgr-wide"><span className="icon-inline" aria-hidden="true"><Icon name="camera" size={18}/></span>Foto do local · uma foto<input type="file" accept="image/*" capture="environment" onChange={choose}/><small>A foto é reduzida no próprio aparelho antes do envio. Para a sugestão de IA ela é obrigatória; o relato manual funciona sem foto.</small></label>
      {localError && <p className="client-form-message client-form-error" role="alert">{localError}</p>}
      {preview && <div className="form-field pgr-wide"><Image src={preview} alt="Prévia da foto anexada ao relato" width={360} height={270} unoptimized style={{ maxWidth: "100%", height: "auto", borderRadius: 8 }}/></div>}
      <label className="form-field pgr-wide">O que aconteceu ou foi observado<textarea ref={descriptionField} name="description" required rows={4} maxLength={2000} defaultValue="" onChange={markEdited}/></label>
      <label className="form-field pgr-wide">Ação imediata tomada (opcional)<textarea ref={immediateField} name="immediateAction" rows={2} maxLength={1000} defaultValue="" onChange={markEdited}/></label>
      {draft && <DraftPreview draft={draft}/>}
      {state.quota && <p className="permission-note" role="status">Análises de IA hoje: {state.quota.usedToday} de {state.quota.dailyLimit} · no mês: {state.quota.usedMonth} de {state.quota.monthlyLimit}</p>}
      <Feedback state={state}/>
      <div className="pgr-form-footer"><p>Descreva fatos, sem citar nomes de pessoas se não for necessário. A sugestão de IA é simulada nesta versão.</p>
        <div>
          <button className="secondary-button" name="intent" value="suggest" disabled={pending}><span className="icon-inline" aria-hidden="true"><Icon name="spark" size={18}/></span>{pending ? "Processando…" : "Sugerir com IA (simulado)"}</button>
          <button className="primary-button" name="intent" value="report" disabled={pending}><span className="icon-inline" aria-hidden="true"><Icon name="check" size={18}/></span>{pending ? "Enviando…" : "Enviar relato"}</button>
        </div>
      </div>
    </form>
  </details>;
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

function historyLabel(entry: DeviationView["history"][number]) {
  if (entry.action === "reported") return "Relato registrado";
  if (entry.action === "ai_reviewed") return "Rascunho de IA revisado";
  return statusLabel[entry.status];
}

export default function DeviationSection({ companies, items, canManage }: { companies: ClientCompany[]; items: DeviationView[]; canManage: boolean }) {
  return <section className="panel pgr-section" aria-label="Desvios de SST">
    <div className="document-warning">Use somente dados fictícios. O relato é uma informação declarada por quem o registrou; não classifica gravidade nem atesta conformidade. Armazenamento local de demonstração, sem criptografia.</div>
    <NewReport companies={companies}/>
    <h2><span className="icon-inline" aria-hidden="true"><Icon name="history" size={18}/></span>{canManage ? "Relatos recebidos" : "Meus relatos"}</h2>
    {items.length ? items.map((item) => <article className="pgr-card" key={item.id}><header><div><h3>{kindLabel[item.kind]} · {item.location}</h3><p>{statusLabel[item.status]} · {item.occurredOn.split("-").reverse().join("/")} · {item.reporterName}{item.scopeLabel ? ` · ${item.scopeLabel}` : ""}</p></div></header>
      <p>{item.description}</p>{item.immediateAction && <p><strong>Ação imediata:</strong> {item.immediateAction}</p>}
      {item.photo && <p><a href={`/api/deviation-photos/${encodeURIComponent(item.id)}`} target="_blank" rel="noreferrer"><span className="icon-inline" aria-hidden="true"><Icon name="camera" size={15}/></span>Ver foto anexada</a></p>}
      {item.ai && <p className="permission-note"><span className="icon-inline" aria-hidden="true"><Icon name="spark" size={15}/></span>Relato apoiado por rascunho de IA simulado, revisado antes de salvar. Plano de ação sugerido: {item.ai.actions.length} {item.ai.actions.length === 1 ? "item" : "itens"}.</p>}
      <details><summary>Histórico</summary><ul>{item.history.map((entry, index) => <li key={index}>{new Date(entry.occurredAt).toLocaleString("pt-BR")} · {historyLabel(entry)}{entry.note ? ` · ${entry.note}` : ""}</li>)}</ul></details>
      {canManage && item.status !== "closed" && <details><summary>Tratar</summary><Treat item={item}/></details>}
      {canManage && <p><a href={ncHref(item)}>Abrir não conformidade</a></p>}</article>) : <div className="client-empty"><span className="client-empty-icon" aria-hidden="true"><Icon name="clipboard" size={22}/></span><h3>Nenhum relato por enquanto</h3><p>O primeiro desvio ou quase incidente registrado aparece aqui, com foto, histórico e tratativa.</p></div>}
  </section>;
}
