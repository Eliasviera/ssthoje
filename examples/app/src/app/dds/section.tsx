"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import type { ClientCompany } from "@/lib/client-store";
import type { DdsRecord } from "@/lib/dds-store";
import { createDdsAction, signDdsAction, closeDdsAction, type DdsFormState } from "./actions";

type WorkerOption = { id: string; name: string; jobTitle: string; companyId: string };

function Feedback({ state }: { state: DdsFormState }) {
  return <>{state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}{state.success && <p className="client-form-message client-form-success" role="status">{state.success}</p>}</>;
}

function SignaturePad({ recordId, revision, attendeeId, label }: { recordId: string; revision: number; attendeeId: string; label: string }) {
  const [state, action, pending] = useActionState(signDdsAction, {});
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (context) { context.lineWidth = 2.5; context.lineCap = "round"; context.strokeStyle = "#111"; }
  }, []);
  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (event.currentTarget.width / rect.width), y: (event.clientY - rect.top) * (event.currentTarget.height / rect.height) };
  }
  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = point(event);
    context.beginPath(); context.moveTo(x, y);
  }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const { x, y } = point(event);
    context.lineTo(x, y); context.stroke(); setEmpty(false);
  }
  function clear() {
    const element = canvas.current;
    element?.getContext("2d")?.clearRect(0, 0, element.width, element.height);
    setEmpty(true);
  }
  return <form action={action} onSubmit={() => { if (image.current && canvas.current) image.current.value = canvas.current.toDataURL("image/png"); }} className="pgr-form">
    <input type="hidden" name="id" value={recordId}/><input type="hidden" name="revision" value={revision}/><input type="hidden" name="attendeeId" value={attendeeId}/><input type="hidden" name="image" ref={image}/>
    <div className="form-field pgr-wide"><span>{label}</span>
      <canvas ref={canvas} width={400} height={140} aria-label={`Área de assinatura: ${label}`} style={{ border: "1px solid #888", background: "#fff", touchAction: "none", maxWidth: "100%" }}
        onPointerDown={start} onPointerMove={move} onPointerUp={() => { drawing.current = false; }} onPointerLeave={() => { drawing.current = false; }}/></div>
    <Feedback state={state}/>
    <div className="pgr-form-footer"><button type="button" className="text-action" onClick={clear}>Limpar</button><button className="secondary-button" disabled={pending || empty}>{pending ? "Salvando…" : "Registrar assinatura"}</button></div>
  </form>;
}

function Close({ record }: { record: DdsRecord }) {
  const [state, action, pending] = useActionState(closeDdsAction, {});
  return <form action={action} className="pgr-form"><input type="hidden" name="id" value={record.id}/><input type="hidden" name="revision" value={record.revision}/><Feedback state={state}/>
    <div className="pgr-form-footer"><p>Depois de encerrado, o DDS não pode ser alterado.</p><button className="secondary-button" disabled={pending}>Encerrar DDS</button></div></form>;
}

function Card({ record, company, canManage }: { record: DdsRecord; company?: ClientCompany; canManage: boolean }) {
  const open = record.status === "draft" && canManage;
  return <article className="pgr-card"><header><div><h3>{record.theme}</h3><p>{company?.tradeName || company?.legalName || "Empresa indisponível"} · {record.heldOn.split("-").reverse().join("/")} · {record.location}</p></div><span className="period-label">{record.status === "closed" ? "Encerrado" : "Em coleta"}</span></header>
    <p><strong>Responsável:</strong> {record.responsible} · {record.responsibleSignature ? "assinou" : "aguardando assinatura"}</p>
    {record.notes && <p><strong>Observações:</strong> {record.notes}</p>}
    {open && !record.responsibleSignature && <details><summary>Assinar como responsável</summary><SignaturePad recordId={record.id} revision={record.revision} attendeeId="responsible" label={record.responsible}/></details>}
    <ul>{record.attendees.map((attendee) => <li key={attendee.id}><strong>{attendee.workerName}</strong>{attendee.registered ? "" : " · não cadastrado"} · {attendee.signature ? `assinou em ${new Date(attendee.signature.signedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "aguardando assinatura"}
      {open && !attendee.signature && <details><summary>Coletar assinatura</summary><SignaturePad recordId={record.id} revision={record.revision} attendeeId={attendee.id} label={attendee.workerName}/></details>}</li>)}</ul>
    {open && <Close record={record}/>}
    <p><small>Assinatura simples desenhada na tela, sem validade de assinatura qualificada (ICP-Brasil).</small></p>
  </article>;
}

export default function DdsSection({ companies, workers, records, canManage }: { companies: ClientCompany[]; workers: WorkerOption[]; records: DdsRecord[]; canManage: boolean }) {
  const [state, action, pending] = useActionState(createDdsAction, {});
  const [companyId, setCompanyId] = useState("");
  const visible = workers.filter((worker) => !companyId || worker.companyId === companyId);
  return <section className="panel pgr-section" aria-label="DDS">
    <div className="document-warning">Use somente dados fictícios. O DDS é um registro declarado pela equipe; não atesta conformidade. Armazenamento local de demonstração, sem criptografia. Biometria não está habilitada.</div>
    {canManage && <details className="aso-new"><summary>Registrar DDS</summary><form action={action} className="pgr-form">
      <label className="form-field pgr-wide">Empresa e unidade<select name="scope" required defaultValue="" onChange={(event) => setCompanyId(event.target.value.split("|")[0])}><option value="">Selecione</option>{companies.filter((item) => item.status === "active").flatMap((item) => item.units.map((unit) => <option key={`${item.id}|${unit.id}`} value={`${item.id}|${unit.id}`}>{item.tradeName || item.legalName} · {unit.name}</option>))}</select></label>
      <label className="form-field">Tema<input name="theme" required maxLength={160}/></label><label className="form-field">Data<input type="date" name="heldOn" required/></label>
      <label className="form-field">Local<input name="location" required maxLength={200}/></label><label className="form-field">Responsável (líder ou encarregado)<input name="responsible" required maxLength={120}/></label>
      <fieldset className="form-field pgr-wide"><legend>Participantes cadastrados</legend>{visible.length ? visible.map((worker) => <label key={worker.id} style={{ display: "block" }}><input type="checkbox" name="workerIds" value={worker.id}/> {worker.name} · {worker.jobTitle}</label>) : <p>Nenhum trabalhador ativo para a empresa selecionada.</p>}</fieldset>
      <label className="form-field pgr-wide">Outros participantes, não cadastrados (um nome por linha)<textarea name="manualNames" rows={3} maxLength={2000}/></label>
      <label className="form-field pgr-wide">Observações<textarea name="notes" rows={2} maxLength={1000}/></label><Feedback state={state}/>
      <div className="pgr-form-footer"><p>O tema é livre. O sistema não sugere conteúdo normativo.</p><button className="secondary-button" disabled={pending}>{pending ? "Salvando…" : "Registrar DDS"}</button></div>
    </form></details>}
    {records.length ? records.map((record) => <Card key={record.id} record={record} company={companies.find((item) => item.id === record.companyId)} canManage={canManage}/>) : <p>Nenhum DDS registrado.</p>}
  </section>;
}
