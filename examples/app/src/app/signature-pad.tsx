"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { SafetyOperationsFormState } from "./safety-operations-actions";

function Feedback({ state }: { state: SafetyOperationsFormState }) {
  return <>{state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}{state.success && <p className="client-form-message client-form-success" role="status">{state.success}</p>}</>;
}

export default function SignaturePad({ action, fields, label, buttonLabel }: {
  action: (state: SafetyOperationsFormState, data: FormData) => Promise<SafetyOperationsFormState>;
  fields: Record<string, string>;
  label: string;
  buttonLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
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
  return <form action={formAction} onSubmit={() => { if (image.current && canvas.current) image.current.value = canvas.current.toDataURL("image/png"); }} className="signature-pad">
    {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value}/>)}
    <input type="hidden" name="image" ref={image}/>
    <div className="form-field"><span>{label}</span>
      <canvas ref={canvas} width={400} height={140} aria-label={`Área de assinatura: ${label}`} style={{ border: "1px solid #888", background: "#fff", touchAction: "none", maxWidth: "100%" }}
        onPointerDown={start} onPointerMove={move} onPointerUp={() => { drawing.current = false; }} onPointerLeave={() => { drawing.current = false; }}/></div>
    <Feedback state={state}/>
    <div className="signature-pad-actions"><button type="button" className="text-action" onClick={clear}>Limpar</button><button className="secondary-button" disabled={pending || empty}>{pending ? "Salvando…" : buttonLabel}</button></div>
  </form>;
}
