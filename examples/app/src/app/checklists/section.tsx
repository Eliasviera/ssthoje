"use client";
import { useActionState, useRef, useState } from "react";
import type { ClientCompany } from "@/lib/client-store";
import type { ChecklistTemplate } from "@/lib/checklist-store";
import { archiveTemplateAction, completeInspectionAction, createTemplateAction, type ChecklistFormState } from "./actions";

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

function Apply({ template, companies }: { template: ChecklistTemplate; companies: ClientCompany[] }) {
  const [state, action, pending] = useActionState(completeInspectionAction, {});
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  function pos(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (event.currentTarget.width / rect.width), y: (event.clientY - rect.top) * (event.currentTarget.height / rect.height) };
  }
  return <form action={action} className="pgr-form" onSubmit={() => { if (image.current && canvas.current) image.current.value = canvas.current.toDataURL("image/png"); }}>
    <input type="hidden" name="templateId" value={template.id}/><input type="hidden" name="image" ref={image}/>
    <label className="form-field pgr-wide">Empresa e unidade<select name="scope" required defaultValue=""><option value="">Selecione</option>{companies.filter((item) => item.status === "active").flatMap((item) => item.units.map((unit) => <option key={`${item.id}|${unit.id}`} value={`${item.id}|${unit.id}`}>{item.tradeName || item.legalName} · {unit.name}</option>))}</select></label>
    <label className="form-field">{template.kind === "area" ? "Área inspecionada" : "Equipamento inspecionado"}<input name="subject" required maxLength={160}/></label>
    <label className="form-field">Data<input type="date" name="performedOn" required/></label>
    <label className="form-field">Responsável pela inspeção<input name="inspector" required maxLength={120}/></label>
    {template.items.map((item) => <fieldset className="form-field pgr-wide" key={item.id}><legend>{item.text}</legend>
      {(["ok", "nok", "na"] as const).map((value) => <label key={value} style={{ marginRight: 12 }}><input type="radio" name={`answer:${item.id}`} value={value} required/> {answerLabel[value]}</label>)}
      <input name={`note:${item.id}`} maxLength={500} placeholder="Observação (obrigatória se não conforme)" aria-label={`Observação: ${item.text}`}/></fieldset>)}
    <div className="form-field pgr-wide"><span>Assinatura do responsável</span>
      <canvas ref={canvas} width={400} height={140} aria-label="Área de assinatura" style={{ border: "1px solid #888", background: "#fff", touchAction: "none", maxWidth: "100%" }}
        onPointerDown={(event) => { const c = event.currentTarget.getContext("2d"); if (!c) return; event.currentTarget.setPointerCapture(event.pointerId); c.lineWidth = 2.5; c.lineCap = "round"; drawing.current = true; const p = pos(event); c.beginPath(); c.moveTo(p.x, p.y); }}
        onPointerMove={(event) => { if (!drawing.current) return; const c = event.currentTarget.getContext("2d"); if (!c) return; const p = pos(event); c.lineTo(p.x, p.y); c.stroke(); setEmpty(false); }}
        onPointerUp={() => { drawing.current = false; }} onPointerLeave={() => { drawing.current = false; }}/>
      <button type="button" className="text-action" onClick={() => { const c = canvas.current; c?.getContext("2d")?.clearRect(0, 0, c.width, c.height); setEmpty(true); }}>Limpar</button></div>
    <Feedback state={state}/>
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

export default function ChecklistSection({ companies, templates, inspections, canApply, canManage }: { companies: ClientCompany[]; templates: ChecklistTemplate[]; inspections: InspectionView[]; canApply: boolean; canManage: boolean }) {
  const [state, action, pending] = useActionState(createTemplateAction, {});
  const active = templates.filter((item) => item.status === "active");
  return <section className="panel pgr-section" aria-label="Checklists">
    <div className="document-warning">Use somente dados fictícios. O checklist é um registro declarado pela equipe; não atesta conformidade nem libera atividade. Armazenamento local de demonstração, sem criptografia.</div>
    {canManage && <details className="aso-new"><summary>Criar modelo de checklist</summary><form action={action} className="pgr-form">
      <label className="form-field">Tipo<select name="kind" required><option value="area">Área</option><option value="equipment">Equipamento</option></select></label>
      <label className="form-field">Nome do modelo<input name="name" required maxLength={120}/></label>
      <label className="form-field pgr-wide">Itens (um por linha)<textarea name="items" required rows={6} maxLength={30000}/></label><Feedback state={state}/>
      <div className="pgr-form-footer"><p>Os itens são definidos por você. O sistema não sugere critérios normativos.</p><button className="secondary-button" disabled={pending}>{pending ? "Salvando…" : "Criar modelo"}</button></div></form></details>}
    <h2>Modelos ativos</h2>
    {active.length ? active.map((template) => <article className="pgr-card" key={template.id}><header><div><h3>{template.name}</h3><p>{kindLabel[template.kind]} · {template.items.length} itens</p></div></header>
      {canApply && (template.kind === "equipment" || canManage) && <details><summary>Aplicar checklist</summary><Apply template={template} companies={companies}/></details>}
      {canApply && template.kind === "area" && !canManage && <p>Checklist de área: aplicado pelo TST.</p>}
      {canManage && <Archive id={template.id}/>}</article>) : <p>Nenhum modelo ativo.{canManage ? " Crie o primeiro acima." : ""}</p>}
    <h2>Inspeções registradas</h2>
    {inspections.length ? inspections.map((inspection) => <article className="pgr-card" key={inspection.id}><header><div><h3>{inspection.templateName} · {inspection.subject}</h3><p>{kindLabel[inspection.kind]} · {inspection.performedOn.split("-").reverse().join("/")} · {inspection.inspector}</p></div>
      <span className="period-label">{inspection.results.filter((r) => r.answer === "nok").length} não conforme(s)</span></header>
      <details><summary>Ver respostas</summary><ul>{inspection.results.map((r) => <li key={r.itemId}><strong>{r.text}</strong>: {answerLabel[r.answer]}{r.note ? ` · ${r.note}` : ""}{canManage && r.answer === "nok" && <> · <a href={ncHref(inspection, r)}>Abrir não conformidade</a></>}</li>)}</ul></details>
      <p><small>Assinado em {new Date(inspection.signedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília). Assinatura simples.</small></p><SharePdf id={inspection.id} performedOn={inspection.performedOn}/></article>) : <p>Nenhuma inspeção registrada.</p>}
  </section>;
}
