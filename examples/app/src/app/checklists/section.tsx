"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import type { ClientCompany } from "@/lib/client-store";
import type { ChecklistTemplate } from "@/lib/checklist-store";
import type { EquipmentRecord } from "@/lib/equipment-inventory-store";
import { archiveTemplateAction, completeInspectionAction, createTemplateAction, syncPendingInspectionAction, type ChecklistFormState } from "./actions";
import { queueInspection, listPendingInspections, removePendingInspection } from "@/lib/checklist-offline-queue";

type InspectionView = { id: string; templateName: string; kind: "area" | "equipment"; companyId: string; unitId: string; subject: string; performedOn: string; inspector: string; signedAt: string; results: { itemId: string; text: string; answer: "ok" | "nok" | "na"; note: string }[] };
const kindLabel = { area: "Área", equipment: "Equipamento" } as const;
const answerLabel = { ok: "Conforme", nok: "Não conforme", na: "Não se aplica" } as const;

function Feedback({ state }: { state: ChecklistFormState }) {
  return <>{state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}{state.success && <p className="client-form-message client-form-success" role="status">{state.success}</p>}</>;
}

function SharePdf({ id, performedOn }: { id: string; performedOn: string }) {
  const url = `/api/checklists/${id}/pdf`;
  async function share() {
    const response = await fetch(url);
    if (!response.ok) { window.alert("Não foi possível gerar o PDF."); return; }
    const file = new File([await response.blob()], `checklist-${performedOn}.pdf`, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: "Checklist" }); } catch { /* cancelado */ } return; }
    window.location.assign(url);
  }
  return <p><a className="secondary-button" href={url}>Baixar PDF</a> <button type="button" className="secondary-button" onClick={share}>Enviar (WhatsApp/e-mail)</button></p>;
}

function Archive({ id }: { id: string }) {
  const [state, action, pending] = useActionState(archiveTemplateAction, {});
  return <form action={action}><input type="hidden" name="id" value={id}/><Feedback state={state}/><button className="text-action" disabled={pending}>Arquivar modelo</button></form>;
}

function SyncPending() {
  const [pendingItems, setPendingItems] = useState<Awaited<ReturnType<typeof listPendingInspections>>>([]);
  const [syncState, syncAction, syncPending] = useActionState(syncPendingInspectionAction, {} as ChecklistFormState);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    listPendingInspections("tenant-horizonte").then((items) => { if (active) setPendingItems(items); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  async function reload() { setPendingItems(await listPendingInspections("tenant-horizonte")); }
  if (pendingItems.length === 0) return null;
  return <section className="panel" style={{ border: "1px solid #e0b04e", background: "#fff8ec" }}>
    <p><strong>{pendingItems.length} inspeção(ões) aguardando sincronização</strong> — feitas sem internet. Conecte-se e envie.</p>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {pendingItems.map((item) => <form key={item.id} action={syncAction} onSubmit={() => { void removePendingInspection(item.id); setNotice("Enviada! Removendo da fila..."); }}>
        <input type="hidden" name="templateId" value={item.templateId}/>
        <input type="hidden" name="scope" value={`${item.companyId}|${item.unitId}`}/>
        <input type="hidden" name="subject" value={item.subject}/>
        <input type="hidden" name="performedOn" value={item.performedOn}/>
        <input type="hidden" name="inspector" value={item.inspector}/>
        <input type="hidden" name="image" value={item.image}/>
        {Object.entries(item.answers).map(([answerId, value]) => <span key={answerId}><input type="hidden" name={`answer:${answerId}`} value={value.answer}/><input type="hidden" name={`note:${answerId}`} value={value.note}/></span>)}
        {item.freeNotes[0] && <><input type="hidden" name="free0label" value={item.freeNotes[0].label}/><input type="hidden" name="free0text" value={item.freeNotes[0].text}/></>}
        {item.freeNotes[1] && <><input type="hidden" name="free1label" value={item.freeNotes[1].label}/><input type="hidden" name="free1text" value={item.freeNotes[1].text}/></>}
        <button className="secondary-button" disabled={syncPending}>{item.subject} · {item.performedOn} · Enviar</button>
      </form>)}
    </div>
    {notice && <p role="status">{notice}</p>}
    {syncState.success && <p role="status" className="client-form-message client-form-success">{syncState.success}</p>}
    {syncState.error && <p role="alert" className="client-form-message client-form-error">{syncState.error}</p>}
    <p><button type="button" className="text-action" onClick={reload}>Atualizar fila</button></p>
  </section>;
}

function Apply({ template, companies, equipment }: { template: ChecklistTemplate; companies: ClientCompany[]; equipment: EquipmentRecord[] }) {
  const [state, action, pending] = useActionState(completeInspectionAction, {});
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  function pos(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (event.currentTarget.width / rect.width), y: (event.clientY - rect.top) * (event.currentTarget.height / rect.height) };
  }
  const [offlineState, setOfflineState] = useState<string>("");
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    if (image.current && canvas.current) image.current.value = canvas.current.toDataURL("image/png");
    if (navigator.onLine === false) {
      event.preventDefault();
      const data = new FormData(form);
      const scope = String(data.get("scope") || "").split("|");
      const answers: Record<string, { answer: string; note: string }> = {};
      for (const [key, value] of data.entries()) {
        if (key.startsWith("answer:") && typeof value === "string") answers[key.slice(7)] = { answer: value, note: String(data.get(`note:${key.slice(7)}`) || "") };
      }
      await queueInspection({ id: crypto.randomUUID(), tenantId: "tenant-horizonte", templateId: template.id, companyId: scope[0] || "", unitId: scope[1] || "", subject: String(data.get("subject") || ""), performedOn: String(data.get("performedOn") || ""), inspector: String(data.get("inspector") || ""), answers, freeNotes: [{ label: String(data.get("free0label") || ""), text: String(data.get("free0text") || "") }, { label: String(data.get("free1label") || ""), text: String(data.get("free1text") || "") }].filter((entry) => entry.label || entry.text), image: String(data.get("image") || ""), capturedAt: new Date().toISOString() });
      setOfflineState("Sem conexão. Inspeção guardada no aparelho e será enviada quando a rede voltar.");
    }
  }
  return <form action={action} className="pgr-form" onSubmit={handleSubmit}>
    <input type="hidden" name="templateId" value={template.id}/><input type="hidden" name="image" ref={image}/>
    <label className="form-field pgr-wide">Empresa e unidade<select name="scope" required defaultValue=""><option value="">Selecione</option>{companies.filter((item) => item.status === "active").flatMap((item) => item.units.map((unit) => <option key={`${item.id}|${unit.id}`} value={`${item.id}|${unit.id}`}>{item.tradeName || item.legalName} · {unit.name}</option>))}</select></label>
    {template.kind === "equipment" && equipment.length > 0
      ? <><label className="form-field">Equipamento inspecionado<select name="equipmentId" required defaultValue="" onChange={(event) => { const selected = equipment.find((entry) => entry.id === event.target.value); const field = event.currentTarget.form?.querySelector<HTMLInputElement>("[name=subject]"); if (field) field.value = selected ? `${selected.code} · ${selected.name}` : ""; }}><option value="" disabled>Selecione</option>{equipment.filter((entry) => entry.situation !== "baixado" && (!entry.checklistTemplateId || entry.checklistTemplateId === template.id)).map((entry) => <option key={entry.id} value={entry.id}>{entry.code} · {entry.name}</option>)}</select></label>
      <label className="form-field">Identificação registrada<input name="subject" required maxLength={160} readOnly placeholder="Preenchido ao escolher o equipamento"/></label></>
      : <label className="form-field">{template.kind === "area" ? "Área inspecionada" : "Equipamento inspecionado"}<input name="subject" required maxLength={160}/></label>}
    <label className="form-field">Data<input type="date" name="performedOn" required/></label>
    <label className="form-field">Responsável pela inspeção<input name="inspector" required maxLength={120}/></label>
    {template.items.map((item) => <fieldset className="form-field pgr-wide" key={item.id}><legend>{item.text}{item.critical ? <strong style={{ color: "#b03a2e", marginLeft: 8 }}>· CRÍTICO</strong> : null}</legend>
      {(["ok", "nok", "na"] as const).map((value) => <label key={value} style={{ marginRight: 12 }}><input type="radio" name={`answer:${item.id}`} value={value} required/> {answerLabel[value]}</label>)}
      <input name={`note:${item.id}`} maxLength={500} placeholder="Observação (obrigatória se não conforme)" aria-label={`Observação: ${item.text}`}/></fieldset>)}
    <fieldset className="form-field pgr-wide" style={{ marginTop: ".5rem" }}><legend>Ocorrência 1 (campo livre)</legend><input name="free0label" maxLength={80} placeholder="Título (ex.: barulho estranho)"/><input name="free0text" maxLength={500} placeholder="Descreva o que ocorreu"/></fieldset>
    <fieldset className="form-field pgr-wide" style={{ marginTop: ".5rem" }}><legend>Ocorrência 2 (campo livre)</legend><input name="free1label" maxLength={80} placeholder="Título"/><input name="free1text" maxLength={500} placeholder="Descreva o que ocorreu"/></fieldset>
    <div className="form-field pgr-wide"><span>Assinatura do responsável</span>
      <canvas ref={canvas} width={400} height={140} aria-label="Área de assinatura" style={{ border: "1px solid #888", background: "#fff", touchAction: "none", maxWidth: "100%" }}
        onPointerDown={(event) => { const c = event.currentTarget.getContext("2d"); if (!c) return; event.currentTarget.setPointerCapture(event.pointerId); c.lineWidth = 2.5; c.lineCap = "round"; drawing.current = true; const p = pos(event); c.beginPath(); c.moveTo(p.x, p.y); }}
        onPointerMove={(event) => { if (!drawing.current) return; const c = event.currentTarget.getContext("2d"); if (!c) return; const p = pos(event); c.lineTo(p.x, p.y); c.stroke(); setEmpty(false); }}
        onPointerUp={() => { drawing.current = false; }} onPointerLeave={() => { drawing.current = false; }}/>
      <button type="button" className="text-action" onClick={() => { const c = canvas.current; c?.getContext("2d")?.clearRect(0, 0, c.width, c.height); setEmpty(true); }}>Limpar</button></div>
    <Feedback state={state}/>
    {offlineState && <p role="status" className="client-form-message client-form-success">{offlineState}</p>}
    <div className="pgr-form-footer"><p>Assinatura simples desenhada na tela, sem validade de assinatura qualificada.</p><button className="secondary-button" disabled={pending || empty}>{pending ? "Salvando…" : "Registrar inspeção"}</button></div>
  </form>;
}

function ncHref(inspection: InspectionView, result: InspectionView["results"][number]) {
  const query = new URLSearchParams({
    scope: `${inspection.companyId}|${inspection.unitId}`,
    title: `${result.text} (checklist)`.slice(0, 140),
    location: inspection.subject.slice(0, 500),
    description: `Item não conforme no checklist "${inspection.templateName}" (${inspection.performedOn}): ${result.text}.${result.note ? ` Observação: ${result.note}` : ""}`.slice(0, 2000),
    evidence: `Checklist "${inspection.templateName}" aplicado em ${inspection.performedOn} por ${inspection.inspector}, assinado pelo inspetor (inspeção ${inspection.id}).`.slice(0, 2000),
  });
  return `/nao-conformidades?${query.toString()}`;
}

export default function ChecklistSection({ companies, templates, inspections, equipment, canApply, canManage }: { companies: ClientCompany[]; templates: ChecklistTemplate[]; inspections: InspectionView[]; equipment: EquipmentRecord[]; canApply: boolean; canManage: boolean }) {
  const [state, action, pending] = useActionState(createTemplateAction, {});
  const [draftItems, setDraftItems] = useState<{ text: string; critical: boolean }[]>([{ text: "", critical: false }]);
  const active = templates.filter((item) => item.status === "active");
  return <section className="panel pgr-section" aria-label="Checklists">
    <SyncPending/>
    <div className="document-warning">Use somente dados fictícios. O checklist é um registro declarado pela equipe; não atesta conformidade nem libera atividade. Armazenamento local de demonstração, sem criptografia.</div>
    {canManage && <details className="aso-new"><summary>Criar modelo de checklist</summary><form action={action} className="pgr-form">
      <label className="form-field">Tipo<select name="kind" required><option value="area">Área</option><option value="equipment">Equipamento</option></select></label>
      <label className="form-field">Nome do modelo<input name="name" required maxLength={120}/></label>
      <fieldset className="form-field pgr-wide" style={{ border: "1px solid #d8e3df", borderRadius: ".5rem", padding: ".6rem .8rem" }}>
        <legend>Itens do checklist</legend>
        {draftItems.map((item, index) => <div key={index} style={{ display: "flex", gap: ".5rem", alignItems: "center", marginBottom: ".4rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: ".35rem", whiteSpace: "nowrap" }}><input type="checkbox" name="criticalItems" value={String(index)} checked={item.critical} onChange={(event) => setDraftItems((prev) => prev.map((entry, i) => i === index ? { ...entry, critical: event.target.checked } : entry))}/><span style={{ fontSize: ".8rem", color: "#b03a2e", fontWeight: 700 }}>Crítico</span></label>
          <input name="items" required maxLength={300} defaultValue={item.text} onChange={(event) => setDraftItems((prev) => prev.map((entry, i) => i === index ? { ...entry, text: event.target.value } : entry))} placeholder={`Item ${index + 1}`} style={{ flex: 1 }}/>
        </div>)}
        <button type="button" className="text-action" onClick={() => setDraftItems((prev) => [...prev, { text: "", critical: false }])}>+ Adicionar item</button>
      </fieldset><Feedback state={state}/>
      <div className="pgr-form-footer"><p>Os itens são definidos por você. O sistema não sugere critérios normativos.</p><button className="secondary-button" disabled={pending}>{pending ? "Salvando…" : "Criar modelo"}</button></div></form></details>}
    <h2>Modelos ativos</h2>
    {active.length ? active.map((template) => <article className="pgr-card" key={template.id}><header><div><h3>{template.name}</h3><p>{kindLabel[template.kind]} · {template.items.length} itens</p></div></header>
      {canApply && (template.kind === "equipment" || canManage) && <details><summary>Aplicar checklist</summary><Apply template={template} companies={companies} equipment={equipment}/></details>}
      {canApply && template.kind === "area" && !canManage && <p>Checklist de área: aplicado pelo TST.</p>}
      {canManage && <Archive id={template.id}/>}</article>) : <p>Nenhum modelo ativo.{canManage ? " Crie o primeiro acima." : ""}</p>}
    <h2>Inspeções registradas</h2>
    {inspections.length ? inspections.map((inspection) => <article className="pgr-card" key={inspection.id}><header><div><h3>{inspection.templateName} · {inspection.subject}</h3><p>{kindLabel[inspection.kind]} · {inspection.performedOn.split("-").reverse().join("/")} · {inspection.inspector}</p></div>
      <span className="period-label">{inspection.results.filter((r) => r.answer === "nok").length} não conforme(s)</span></header>
      <details><summary>Ver respostas</summary><ul>{inspection.results.map((r) => <li key={r.itemId}><strong>{r.text}</strong>: {answerLabel[r.answer]}{r.note ? ` · ${r.note}` : ""}{canManage && r.answer === "nok" && <> · <a href={ncHref(inspection, r)}>Abrir não conformidade</a></>}</li>)}</ul></details>
      <p><small>Assinado em {new Date(inspection.signedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília). Assinatura simples.</small></p><SharePdf id={inspection.id} performedOn={inspection.performedOn}/></article>) : <p>Nenhuma inspeção registrada.</p>}
  </section>;
}
