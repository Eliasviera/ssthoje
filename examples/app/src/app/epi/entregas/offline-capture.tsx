"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { EpiItem, EpiOfflineSubmissionSummary, EpiWorker } from "@/lib/epi-store";
import { deleteEpiOfflineDraft, listEpiOfflineDrafts, saveEpiOfflineDraft, type EpiOfflineDraft } from "@/lib/epi-offline-queue";
import { reviewOfflineEpiAction, syncOfflineEpiAction, type EpiOfflineFormState } from "../../epi-actions";

function localDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

function OfflineSubmissionReview({ submission, currentDate }: { submission: EpiOfflineSubmissionSummary; currentDate: string }) {
  const router = useRouter();
  const [state, setState] = useState<EpiOfflineFormState>({});
  const [saving, setSaving] = useState(false);

  async function submitReview(data: FormData) {
    setSaving(true); setState({});
    try {
      const items = submission.items.map((item, index) => ({
        ca: data.get(`reviewCa-${index}`),
        caValidUntil: data.get(`reviewCaValidUntil-${index}`),
        caCheckedOn: data.get(`reviewCaCheckedOn-${index}`),
        caManualChecked: data.get(`reviewCaManualChecked-${index}`) === "on",
      }));
      const review = new FormData();
      review.set("review", JSON.stringify({ submissionId: submission.id, items }));
      const result = await reviewOfflineEpiAction(review);
      setState(result);
      if (result.success) router.refresh();
    } finally { setSaving(false); }
  }

  if (submission.status === "delivery_created") return <p className="permission-note">Revisão concluída. A ficha de entrega offline foi criada{submission.deliveryId ? ` · referência ${submission.deliveryId}` : ""}. A conciliação da saída no estoque segue separada.</p>;
  return <form action={submitReview} className="pgr-form">
    <p className="pgr-wide">Confira cada CA manualmente na consulta do MTE. Consulta com mais de 15 dias ou CA vencido bloqueia a criação da ficha. A data registrada é da revisão atual após sincronização; não comprova o estado histórico do CA nem consulta automática.</p>
    {submission.items.map((item, index) => <fieldset className="epi-item-fields pgr-wide" key={`${submission.id}-${index}`}>
      <legend>Revisão do item {index + 1} · {item.name}</legend>
      <p>{item.quantity} un. · {item.size} · CA anotado na captura: {item.ca || "não informado"}</p>
      <label className="form-field">CA confirmado na consulta manual<input name={`reviewCa-${index}`} inputMode="numeric" pattern="[0-9]{1,8}" maxLength={8} defaultValue={item.ca} required/></label>
      <label className="form-field">Validade exibida no CAEPI<input name={`reviewCaValidUntil-${index}`} type="date" defaultValue={item.caValidUntil} required/></label>
      <label className="form-field">Data desta consulta<input name={`reviewCaCheckedOn-${index}`} type="date" defaultValue={currentDate} required/></label>
      <label className="form-field pgr-wide"><input name={`reviewCaManualChecked-${index}`} type="checkbox" required/>Confirmei manualmente no CAEPI o número e a validade deste CA.</label>
    </fieldset>)}
    {state.error && <p className="client-form-message client-form-error pgr-wide" role="alert">{state.error}</p>}
    {state.success && <p className="permission-note pgr-wide" role="status">{state.success}</p>}
    <div className="pgr-form-footer"><p>Ao concluir, o registro vira ficha de entrega offline, sem link/OTP/comprovante simulado. A baixa de estoque continua pendente até ser vinculada.</p><button className="primary-button" disabled={saving}>{saving ? "Revisando…" : "Concluir revisão e criar ficha"}</button></div>
  </form>;
}

export default function EpiOfflineCapture({ workers, submissions, canManage, scopeKey, currentDate }: {
  workers: EpiWorker[];
  submissions: EpiOfflineSubmissionSummary[];
  canManage: boolean;
  scopeKey: string;
  currentDate: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [rows, setRows] = useState([0]);
  const [drafts, setDrafts] = useState<EpiOfflineDraft[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncingId, setSyncingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refreshDrafts() {
    setDrafts(await listEpiOfflineDrafts(scopeKey));
  }

  useEffect(() => {
    if (!canManage) return;
    let active = true;
    listEpiOfflineDrafts(scopeKey).then(result => {
      if (active) setDrafts(result);
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : "Não foi possível acessar a fila offline.");
    }).finally(() => {
      if (active) setLoaded(true);
    });
    return () => { active = false; };
  }, [canManage, scopeKey]);

  async function saveLocally(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const data = new FormData(form);
      const names = data.getAll("itemName"), sizes = data.getAll("itemSize"), quantities = data.getAll("itemQuantity");
      const references = data.getAll("itemReference"), cas = data.getAll("itemCa"), caDates = data.getAll("itemCaValidUntil"), checkDates = data.getAll("itemCaCheckedOn");
      const workerId = data.get("workerId"), deliveredOn = data.get("deliveredOn");
      if (typeof workerId !== "string" || typeof deliveredOn !== "string") throw new Error("Selecione o trabalhador e a data da entrega.");
      if (names.length < 1 || names.length > 20 || [sizes, quantities, references, cas, caDates, checkDates].some(values => values.length !== names.length)) throw new Error("Confira os itens antes de salvar.");
      const items: EpiItem[] = names.map((value, index) => {
        const strings = [value, sizes[index], quantities[index], references[index], cas[index], caDates[index], checkDates[index]];
        if (strings.some(entry => typeof entry !== "string")) throw new Error("Confira os campos dos itens.");
        const quantity = Number(quantities[index]);
        if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) throw new Error("Informe uma quantidade inteira entre 1 e 1.000.");
        const ca = (cas[index] as string).trim();
        const caValidUntil = (caDates[index] as string).trim();
        const caCheckedOn = (checkDates[index] as string).trim();
        const isDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
        if (!/^\d{1,8}$/.test(ca)) throw new Error("Informe o CA consultado para cada item.");
        if (!isDate(deliveredOn) || deliveredOn > currentDate || !isDate(caValidUntil) || !isDate(caCheckedOn) || caValidUntil < currentDate || caValidUntil < deliveredOn || caCheckedOn > deliveredOn || caCheckedOn < new Date(Date.parse(`${deliveredOn}T12:00:00Z`) - 15 * 86400000).toISOString().slice(0, 10)) throw new Error("Captura offline bloqueada: use CA vigente hoje e na data informada e consulta manual realizada nos 15 dias anteriores.");
        return {
          name: (value as string).trim(), size: (sizes[index] as string).trim(), quantity,
          reference: (references[index] as string).trim(), ca, caValidUntil, caCheckedOn,
        };
      });
      const draft: EpiOfflineDraft = {
        id: crypto.randomUUID(), scopeKey, workerId, deliveredOn, items, capturedAt: new Date().toISOString(),
      };
      await saveEpiOfflineDraft(draft);
      await refreshDrafts();
      form.reset(); setRows([0]);
      setMessage("Rascunho salvo neste dispositivo. A entrega e o CA continuam sem confirmação.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar neste dispositivo.");
    } finally { setBusy(false); }
  }

  async function synchronize(draft: EpiOfflineDraft) {
    if (!navigator.onLine) { setError("Sem conexão detectada. O registro continua salvo neste dispositivo."); return; }
    setSyncingId(draft.id); setError(""); setMessage("");
    try {
      const data = new FormData();
      data.set("submission", JSON.stringify({
        clientRequestId: draft.id, workerId: draft.workerId, deliveredOn: draft.deliveredOn, items: draft.items,
      }));
      const result = await syncOfflineEpiAction(data);
      if (result.error) { setError(result.error); return; }
      await deleteEpiOfflineDraft(draft.id);
      await refreshDrafts();
      setMessage(result.success ?? "Registro recebido pelo servidor como pendente de conferência do CA.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha na sincronização. O rascunho foi mantido neste dispositivo para nova tentativa.");
    } finally { setSyncingId(""); }
  }

  async function discard(draft: EpiOfflineDraft) {
    if (!window.confirm("Excluir este rascunho offline deste dispositivo? Essa ação não poderá ser desfeita.")) return;
    try { await deleteEpiOfflineDraft(draft.id); await refreshDrafts(); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível excluir o rascunho."); }
  }

  return <section className="panel pgr-section" aria-labelledby="epi-offline-title">
    <div className="panel-heading"><div><h2 id="epi-offline-title">Entrega sem internet</h2><p>Fila local separada das fichas operacionais.</p></div><span className="period-label">{drafts.length} neste dispositivo</span></div>
    <div className="document-warning"><strong>Importante:</strong> este recurso usa armazenamento do navegador sem criptografia. Use somente em dispositivo controlado. A tela precisa estar aberta e carregada antes da perda de conexão; ainda não há cache para abrir o app após fechar ou recarregar sem internet. Limpar os dados do navegador pode apagar rascunhos.</div>
    <p>Salvar aqui não confirma a entrega no sistema nem a validade do CA. Ao sincronizar, o servidor revalida o acesso e o vínculo do trabalhador e cria somente um registro pendente de conferência do CA, sem ficha operacional e sem baixa de estoque.</p>
    {error && <p className="client-form-message client-form-error" role="alert">{error}</p>}
    {message && <p className="permission-note" role="status">{message}</p>}
    {canManage && <details className="aso-new"><summary>Registrar rascunho neste dispositivo</summary>
      {workers.length ? <form ref={formRef} className="pgr-form" onSubmit={saveLocally}>
        <label className="form-field">Trabalhador fictício<select name="workerId" defaultValue="" required><option value="" disabled>Selecione</option>{workers.map(worker => <option key={worker.id} value={worker.id}>{worker.displayName} · {worker.companyName} · {worker.unitName}</option>)}</select></label>
        <label className="form-field">Data informada da entrega<input name="deliveredOn" type="date" defaultValue={currentDate} required/></label>
        <div className="pgr-wide epi-items"><h3>Itens informados</h3><p>Para capturar offline, informe CA, validade e data de consulta manual. CA vencido ou conferência com mais de 15 dias bloqueia a captura. O sistema valida apenas os dados informados; não consulta o CAEPI sem conexão.</p>
          {rows.map((row, index) => <fieldset className="epi-item-fields" key={row}><legend>Item {index + 1}</legend>
            <label className="form-field">Nome do EPI<input name="itemName" maxLength={120} required/></label>
            <label className="form-field">Tamanho ou modelo<input name="itemSize" maxLength={60} required/></label>
            <label className="form-field">Quantidade<input name="itemQuantity" type="number" min={1} max={1000} step={1} defaultValue={1} required/></label>
            <label className="form-field">Referência interna<input name="itemReference" maxLength={80}/></label>
            <label className="form-field">CA consultado manualmente<input name="itemCa" inputMode="numeric" pattern="[0-9]{1,8}" maxLength={8} required/></label>
            <label className="form-field">Validade informada do CA<input name="itemCaValidUntil" type="date" required/></label>
            <label className="form-field">Data da consulta manual<input name="itemCaCheckedOn" type="date" defaultValue={currentDate} required/></label>
            {rows.length > 1 && <button type="button" className="secondary-button" onClick={() => setRows(current => current.filter(value => value !== row))}>Remover item {index + 1}</button>}
          </fieldset>)}
          <button type="button" className="secondary-button" disabled={rows.length >= 20 || busy} onClick={() => setRows(current => [...current, Math.max(...current) + 1])}>Adicionar item</button>
        </div>
        <div className="pgr-form-footer"><p>O rascunho fica somente neste navegador até sincronizar ou ser excluído.</p><button className="primary-button" disabled={busy}>{busy ? "Salvando neste dispositivo…" : "Salvar offline"}</button></div>
      </form> : <p className="permission-note">Nenhum trabalhador ativo disponível no escopo atual.</p>}
    </details>}
    {canManage && !loaded && <p aria-live="polite">Carregando fila local…</p>}
    {canManage && loaded && drafts.map(draft => <article className="pgr-card" key={draft.id}>
      <header><div><h3>{workers.find(worker => worker.id === draft.workerId)?.displayName ?? "Trabalhador indisponível"}</h3><p>Data informada: {draft.deliveredOn.split("-").reverse().join("/")} · Captura no dispositivo: {localDate(draft.capturedAt)}</p></div><span className="period-label">Pendente de sincronização e conferência do CA</span></header>
      <ul>{draft.items.map((item, index) => <li key={`${draft.id}-${index}`}>{item.name} · {item.quantity} · {item.size} · CA {item.ca || "não informado"} · conferido em {item.caCheckedOn || "data não informada"}</li>)}</ul>
      <div className="pgr-form-footer"><button type="button" className="primary-button" disabled={syncingId !== ""} onClick={() => synchronize(draft)}>{syncingId === draft.id ? "Sincronizando…" : "Sincronizar com o servidor"}</button><button type="button" className="secondary-button" disabled={syncingId !== ""} onClick={() => discard(draft)}>Excluir rascunho</button></div>
    </article>)}
    {!!submissions.length && <div className="issue-filter"><h3>Registros offline recebidos pelo servidor</h3><p>Os registros são revisados manualmente; somente após a revisão uma ficha offline é criada. A baixa no estoque é conciliada separadamente.</p>{submissions.map(submission => <article className="pgr-card" key={submission.id}>
      <header><div><h4>{submission.workerName}</h4><p>{submission.companyName} · {submission.unitName} · entrega informada em {submission.deliveredOn.split("-").reverse().join("/")}</p></div><span className="period-label">{submission.status === "delivery_created" ? "Revisão concluída" : "Pendente de revisão manual do CA"}</span></header>
      <ul>{submission.items.map((item, index) => <li key={`${submission.id}-${index}`}>{item.name} · {item.quantity} · {item.size} · CA {item.ca || "não informado"} · validade informada {item.caValidUntil || "não informada"} · consulta {item.caCheckedOn || "não informada"}</li>)}</ul>
      <p>Recebido pelo servidor em {localDate(submission.receivedAt)}. O servidor confere o formato e as datas, não a fonte oficial.</p>
      {canManage && <OfflineSubmissionReview submission={submission} currentDate={currentDate}/>}
    </article>)}</div>}
  </section>;
}
